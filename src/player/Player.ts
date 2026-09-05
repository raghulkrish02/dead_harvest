import Phaser from "phaser";
import MeleeWeapon from "../weapons/MeleeWeapon.ts";
import SeedShooter from "../weapons/SeedShooter.ts";

export default class Player extends Phaser.Physics.Arcade.Sprite {
    private speed = 160;
    public hp: number = 100;
    public maxHp: number = 100;

    public weapon!: MeleeWeapon;
    public seedShooter!: SeedShooter;
    private keys!: {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
    };

    private isChargingRanged: boolean = false;
    private chargeStartTime: number = 0;
    private chargeRing?: Phaser.GameObjects.Arc;

    // Dodge & Knockback Properties
    public isDodging: boolean = false;
    public isInvulnerable: boolean = false;
    public isKnockedBack: boolean = false;
    private knockbackTimer: number = 0;
    private dodgeDuration: number = 180;
    private dodgeSpeed: number = 380;
    private dodgeTimer: number = 0;
    private dodgeDir: Phaser.Math.Vector2 = new Phaser.Math.Vector2(0, 1);
    private shiftKey!: Phaser.Input.Keyboard.Key;

    // Visual State & Animation
    private baseScale: number = 0.50;
    private animTimer: number = 0;
    private isFacingLeft: boolean = false;


    public lastCombatActionTime: number = 0;

    private lastMeleeAttackTime: number = 0;

    private groundShadow!: Phaser.GameObjects.Ellipse;

    public pitchforkSprite!: Phaser.GameObjects.Sprite;
    public isMeleeSwinging: boolean = false;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y, "player_idle");

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setCollideWorldBounds(true);
        this.setOrigin(0.5, 0.95);
        this.setScale(this.baseScale);

        // Accurate feet collision box for 256x256 sprite
        // Proportional, solid grounded foot collider (scales cleanly on 256x256 art)
        this.body?.setSize(65, 24);
        this.body?.setOffset(64, 160);

        this.createAnimations(scene);

        this.weapon = new MeleeWeapon(scene);
        this.seedShooter = new SeedShooter(scene);

        scene.input.mouse?.disableContextMenu();

        const spaceKey = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (this.hp <= 0) return;

            const mainScene = this.scene as any;
            if (pointer.y >= 540) return; // 👈 Blocks pitchfork swing when clicking UI
            if (mainScene.isBuildBarOpen) return;

            // 1. Strictly detect Right-Click
            const isRightClick = pointer.rightButtonDown() || pointer.button === 2 || (pointer.event && pointer.event.button === 2);

            if (isRightClick) {
                // 🎯 RANGED / PHOENIX CHARGE ONLY
                this.triggerCombatStance(350);
                this.startRangedCharge();
            } else if (pointer.leftButtonDown() || pointer.button === 0) {
                // 🗡️ MELEE PITCHFORK STAB ONLY
                if (this.isChargingRanged) {
                    this.cancelRangedCharge();
                    return;
                }

                this.triggerCombatStance(350);
                const chestY = this.y - (this.displayHeight * 0.45);
                const isCombo = (this.scene.time.now - this.lastMeleeAttackTime < 450);
                
                // Spends 6 Stamina for single tap, 12 for combo
                
        const swung = this.weapon.attack(this.x, chestY, pointer, mainScene.backpack, false); // 👈 false = 7 Stamina!
        if (swung) {
            this.lastMeleeAttackTime = this.scene.time.now;
            
        }
            }
        });

        scene.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
            if (this.hp <= 0) {
                this.cancelRangedCharge();
                return;
            }
            if (this.isChargingRanged) {
                this.releaseRangedCharge(pointer);
            }
        });

        spaceKey?.on("down", () => {
            if (this.hp <= 0) return;
            const mainScene = this.scene as any;
            if (mainScene.isPlacingFence) return;
            this.startRangedCharge();
        });

        spaceKey?.on("up", () => {
            if (this.hp <= 0) {
                this.cancelRangedCharge();
                return;
            }
            if (this.isChargingRanged) {
                this.releaseRangedCharge(scene.input.activePointer);
            }
        });
         // =========================================================================
        // 🎨 1. HIGH-PUNCH POST-FX PIPELINE (Visibly transforms the character!)
        // =========================================================================
        if (this.postFX) {
            const cm = this.postFX.addColorMatrix();
            cm.saturate(3.5);        // 👈 Deep, vibrant colors (+250% saturation!)
            cm.contrast(1.45, true); // 👈 Deepens dark lines & shadows (+45% contrast)
            cm.brightness(0.90, true); // 👈 Rich warm tone (eliminates washed-out light look)
        }

        // =========================================================================
        // 👥 2. CRISP CULT-OF-THE-LAMB GROUND SHADOW
        // =========================================================================
        // 1. Crisp texture rendering on 256x256 vector art
        this.setTexture("player_idle");
        this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);

        // 2. Deep grounded foot shadow (anchors feet to grass!)
        this.groundShadow = scene.add.ellipse(this.x, this.y, 44, 20, 0x000000, 0.42);
        this.groundShadow.setDepth(1);

        // Modular Arm Rig: Anchored at red shoulder cap, 1:1 scale with player
        this.pitchforkSprite = this.scene.add.sprite(this.x, this.y, "pitchfork");
        this.pitchforkSprite.setOrigin(0.2, 0.25);
        this.pitchforkSprite.setScale(this.baseScale);

        this.initInputs(scene);

        // Synchronize pitchfork AFTER physics step to eliminate 1-frame movement drift
        this.scene.events.on(Phaser.Scenes.Events.POST_UPDATE, () => {
            this.syncPitchforkPosition();
        });
    }

    private createAnimations(scene: Phaser.Scene) {
        if (scene.anims.exists("walk-side")) return;

        if (scene.textures.exists("player_side")) {
            scene.anims.create({
                key: "walk-side",
                frames: scene.anims.generateFrameNumbers("player_side", { frames: [0, 1, 2, 1] }),
                frameRate: 10, // Smooth 100ms stride cadence
                repeat: -1
            });
        }
    }

    public takeDamage(amount: number) {
        if (this.isInvulnerable || this.isDodging || this.hp <= 0) return;
        if (this.hp <= 0) {
            if (this.groundShadow) this.groundShadow.setVisible(false);}
        this.hp = Math.max(0, this.hp - amount);

        // 💥 GUARANTEED ON-HIT EXPLOSIVE AIR SPRAY + GROUND SPLATTER
        this.spawnPlayerBloodSplatter();

        const mainScene = this.scene as any;
        if (mainScene.backpack) {
            mainScene.backpack.updateHP(this.hp, this.maxHp);
        }

        // 🩸 Red Damage Flash -> Restores Moonlit Ambient Tint if Night is Active
        this.setTint(0xff0000);
        this.scene.time.delayedCall(100, () => {
            if (!this.active) return;
            const mainScene = this.scene as any;
            const ambientTint = (mainScene && mainScene.isNightActive) ? 0x99b3d6 : 0xffffff;

            if (ambientTint === 0xffffff) {
                this.clearTint();
                if (this.pitchforkSprite) this.pitchforkSprite.clearTint();
            } else {
                this.setTint(ambientTint);
                if (this.pitchforkSprite) this.pitchforkSprite.setTint(ambientTint);
            }
        });

        this.scene.cameras.main.shake(80, 0.004);

        const popup = this.scene.add.text(this.x, this.y - 80, `-${amount} HP`, {
            fontFamily: "Arial",
            fontSize: "14px",
            color: "#ff3333",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(20000);

        this.scene.tweens.add({
            targets: popup,
            y: popup.y - 25,
            alpha: 0,
            duration: 1000,
            ease: "Cubic.easeOut",
            onComplete: () => popup.destroy()
        });

        if (this.hp <= 0) {
            this.setVelocity(0, 0);
            this.isKnockedBack = false;
            this.isDodging = false;
            const pBody = this.body as Phaser.Physics.Arcade.Body;
            if (pBody) {
                pBody.setVelocity(0, 0);
                pBody.reset(this.x, this.y);
            }

            // 💨 TRIGGER THANOS SNAP DISINTEGRATION
            this.triggerThanosSnapDeath();

            if (mainScene.onPlayerDeath) {
                mainScene.onPlayerDeath();
            }
        }
    }

    private addBodyBloodStain() {
        if (this.bodyBloodStains.length >= 6) return;

        const offsetX = Phaser.Math.Between(-10, 10);
        const offsetY = Phaser.Math.Between(-60, -20);
        const patchW = Phaser.Math.Between(5, 9);
        const patchH = Phaser.Math.Between(3, 6);

        const stain = this.scene.add.ellipse(this.x + offsetX, this.y + offsetY, patchW, patchH, 0x660000, 0.9);
        stain.setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2));
        stain.setDepth(this.depth + 1);

        stain.setData("offsetX", offsetX);
        stain.setData("offsetY", offsetY);
        this.bodyBloodStains.push(stain);
    }

    private updateBloodStains() {
        for (let i = 0; i < this.bodyBloodStains.length; i++) {
            const stain = this.bodyBloodStains[i];
            if (stain && stain.active) {
                const offX = stain.getData("offsetX") || 0;
                const offY = stain.getData("offsetY") || 0;
                stain.setPosition(this.x + (this.isFacingLeft ? -offX : offX), this.y + offY);
                stain.setDepth(this.depth + 1);
            }
        }
    }

    public heal(amount: number) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
        const mainScene = this.scene as any;
        if (mainScene.backpack) {
            mainScene.backpack.updateHP(this.hp, this.maxHp);
        }
    }

    public applyKnockback(dirX: number, dirY: number, force: number = 450, durationMs: number = 220) {
        if (this.hp <= 0) return;
        this.isKnockedBack = true;
        this.knockbackTimer = this.scene.time.now + durationMs;
        this.setVelocity(dirX * force, dirY * force);
        this.cancelRangedCharge();
    }

    public triggerReviveShield(durationMs: number = 3000) {
        this.isInvulnerable = true;
        this.setVelocity(0, 0);

        // 🛑 CRITICAL FIX: Kill any death fade-out tweens so player NEVER stays invisible!
        this.scene.tweens.killTweensOf(this);
        this.setAlpha(1.0);
        this.setVisible(true);

        if (this.pitchforkSprite) {
            this.pitchforkSprite.setVisible(true);
            this.pitchforkSprite.setAlpha(1.0);
            this.isMeleeSwinging = false;
        }
        if (this.groundShadow) this.groundShadow.setVisible(true);

        // ☀️ Restore World Colors from Grayscale on Revive
        if (this.scene.cameras.main.postFX) {
            this.scene.cameras.main.postFX.clear();
            this.scene.cameras.main.postFX.addVignette(0.5, 0.5, 0.82, 0.45);
        }

        const shieldRing = this.scene.add.circle(this.x, this.y - 35, 34, 0x00ffff, 0.3);
        shieldRing.setStrokeStyle(3, 0xffff00).setDepth(25000);

        const flashTween = this.scene.tweens.add({
            targets: this,
            alpha: 0.5,
            duration: 100,
            yoyo: true,
            repeat: -1
        });

        const trackTimer = this.scene.time.addEvent({
            delay: 16,
            repeat: Math.floor(durationMs / 16),
            callback: () => {
                if (shieldRing.active) shieldRing.setPosition(this.x, this.y - 35);
            }
        });

        this.scene.time.delayedCall(durationMs, () => {
            this.isInvulnerable = false;
            this.setAlpha(1.0);
            flashTween.stop();
            trackTimer.remove();
            shieldRing.destroy();
        });
    }

    private startRangedCharge() {
        if (this.hp <= 0) return;
        this.isChargingRanged = true;
        this.chargeStartTime = this.scene.time.now;

        if (this.chargeRing) this.chargeRing.destroy();
        this.chargeRing = this.scene.add.circle(this.x, this.y - 35, 30, 0xff6600, 0.3);
        this.chargeRing.setStrokeStyle(2, 0xffaa00).setDepth(25000);
    }

    private releaseRangedCharge(pointer: Phaser.Input.Pointer) {
        const heldDuration = this.scene.time.now - this.chargeStartTime;
        const chestY = this.y - (this.displayHeight * 0.45);
        const mainScene = this.scene as any;

        if (this.chargeRing) {
            this.chargeRing.destroy();
            this.chargeRing = undefined;
        }
        this.isChargingRanged = false;

        if (mainScene.backpack) {
            if (heldDuration >= 1000) {
                const proj = this.seedShooter.shootPhoenix(this.x, chestY, pointer, mainScene.backpack);
                if (proj && mainScene.registerProjectile) {
                    mainScene.registerProjectile(proj);
                    this.playShootRecoil(pointer, true);
                }
            } else {
                this.fireSeedShooter(chestY, pointer);
            }
        }
    }

    public cancelRangedCharge() {
        if (!this.isChargingRanged) return;
        if (this.chargeRing) {
            this.chargeRing.destroy();
            this.chargeRing = undefined;
        }
        this.isChargingRanged = false;
    }

    private fireSeedShooter(chestY: number, pointer: Phaser.Input.Pointer) {
        const mainScene = this.scene as any;
        if (mainScene.backpack) {
            const proj = this.seedShooter.shoot(this.x, chestY, pointer, mainScene.backpack);
            if (proj && mainScene.registerProjectile) {
                mainScene.registerProjectile(proj);
                this.playShootRecoil(pointer, false);
            }
        }
    }

    private playShootRecoil(pointer: Phaser.Input.Pointer, isPhoenix: boolean = false) {
        const chestY = this.y - (this.displayHeight * 0.45);
        const angle = Phaser.Math.Angle.Between(this.x, chestY, pointer.worldX, pointer.worldY);

        this.setFlipX(pointer.worldX < this.x);

        // Snappy Recoil Kick
        this.scene.tweens.add({
            targets: this,
            scaleX: (pointer.worldX < this.x ? -1 : 1) * (isPhoenix ? this.baseScale * 0.85 : this.baseScale * 0.9),
            scaleY: isPhoenix ? this.baseScale * 1.15 : this.baseScale * 1.1,
            duration: 60,
            yoyo: true
        });

        const muzzleDist = 26;
        const muzzleX = this.x + Math.cos(angle) * muzzleDist;
        const muzzleY = chestY + Math.sin(angle) * muzzleDist;

        const flash = this.scene.add.circle(muzzleX, muzzleY, isPhoenix ? 16 : 8, isPhoenix ? 0xffff00 : 0xffaa00).setDepth(30000);
        this.scene.tweens.add({
            targets: flash,
            scale: 0.1,
            alpha: 0,
            duration: isPhoenix ? 120 : 80,
            onComplete: () => flash.destroy()
        });
    }

    private performDodge() {
        if (this.hp <= 0) return;
        const mainScene = this.scene as any;
        if (!mainScene.backpack || !mainScene.backpack.isDodgeUnlocked) return;
        // ⚡ Dodge cost set to exactly 33 stamina
        if (this.isDodging || !mainScene.backpack.consumeStamina(33)) return;

        this.isDodging = true;
        this.dodgeTimer = this.scene.time.now + this.dodgeDuration;
        this.cancelRangedCharge();
        this.scene.cameras.main.shake(60, 0.003);

        const backX = -this.dodgeDir.x;
        const backY = -this.dodgeDir.y;

        // 💨 1. Thick Friction Kickback Dust Plume (Multi-Layer Earth & Chalk Smoke)
        for (let i = 0; i < 7; i++) {
            const spreadAngle = Phaser.Math.DegToRad(Phaser.Math.Between(-35, 35));
            const driftX = backX * Math.cos(spreadAngle) - backY * Math.sin(spreadAngle);
            const driftY = backX * Math.sin(spreadAngle) + backY * Math.cos(spreadAngle);
            const speed = Phaser.Math.Between(25, 60);

            // 🌿 Meadow Turf Skid: Rich Topsoil + Ripped Grass Flecks
            const dustColor = Phaser.Math.RND.pick([0x382314, 0x4a321e, 0x5e8c31, 0x8ab839, 0x9bb078]);
            const isGrassFleck = i % 3 === 0;
            const dust = isGrassFleck
                ? this.scene.add.ellipse(this.x + Phaser.Math.Between(-6, 6), this.y - 2, Phaser.Math.Between(5, 8), 2.5, dustColor, 0.9)
                : this.scene.add.circle(this.x + Phaser.Math.Between(-6, 6), this.y - 2, Phaser.Math.Between(4, 6), dustColor, 0.75);
            dust.setDepth(2); // Ground depth
            if (isGrassFleck) dust.setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2));

            this.scene.tweens.add({
                targets: dust,
                x: dust.x + driftX * speed,
                y: dust.y + driftY * speed - Phaser.Math.Between(4, 10),
                scale: Phaser.Math.FloatBetween(1.6, 2.2),
                alpha: 0,
                duration: Phaser.Math.Between(280, 420),
                ease: "Cubic.easeOut",
                onComplete: () => dust.destroy()
            });
        }

        // ⚡ 2. Aerodynamic Wind Streamer Ribbons (Cutting through the air)
        for (let w = 0; w < 3; w++) {
            const streamOffset = (w - 1) * 8;
            const perpX = -this.dodgeDir.y * streamOffset;
            const perpY = this.dodgeDir.x * streamOffset;

            const wind = this.scene.add.ellipse(this.x + perpX, this.y - 25 + perpY, 18, 2.5, 0xffffff, 0.95);
            wind.setRotation(Phaser.Math.Angle.Between(0, 0, this.dodgeDir.x, this.dodgeDir.y))
                .setBlendMode(Phaser.BlendModes.ADD)
                .setDepth(this.depth + 1);

            this.scene.tweens.add({
                targets: wind,
                x: wind.x + backX * 45,
                y: wind.y + backY * 45,
                scaleX: 0.1,
                alpha: 0,
                duration: 180,
                ease: "Expo.easeOut",
                onComplete: () => wind.destroy()
            });
        }

        // 🌟 3. Additive Velocity Ghost Mirage (Zero-Lag Luminous After-Image)
        const spawnMirage = () => {
            if (!this.active || !this.isDodging) return;
            const ghost = this.scene.add.sprite(this.x, this.y, this.texture.key, this.frame ? this.frame.name : 0);
            ghost.setOrigin(this.originX, this.originY)
                 .setScale(this.scaleX * 1.1, this.scaleY * 0.9)
                 .setFlipX(this.flipX)
                 .setTint(0x00ffff)
                 .setBlendMode(Phaser.BlendModes.ADD)
                 .setAlpha(0.75)
                 .setDepth(this.depth - 1);

            this.scene.tweens.add({
                targets: ghost,
                alpha: 0,
                scaleX: this.scaleX * 0.8,
                duration: 200,
                ease: "Quad.easeOut",
                onComplete: () => ghost.destroy()
            });
        };

        spawnMirage();
        this.scene.time.delayedCall(50, spawnMirage);
        this.scene.time.delayedCall(100, spawnMirage);
    }

    private initInputs(scene: Phaser.Scene) {
        this.keys = scene.input.keyboard!.addKeys({
            W: Phaser.Input.Keyboard.KeyCodes.W,
            A: Phaser.Input.Keyboard.KeyCodes.A,
            S: Phaser.Input.Keyboard.KeyCodes.S,
            D: Phaser.Input.Keyboard.KeyCodes.D,
        }) as any;

        this.shiftKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.shiftKey.on("down", () => this.performDodge());
    }

    private spawnPlayerBloodSplatter() {
        const currentScene = this.scene;
        if (!currentScene || !currentScene.add || !currentScene.tweens) return;

        const bloodColor = 0x990000;
        const count = 22; // Full count preserved
        const startX = this.x;
        const startY = this.y - 30;

        for (let i = 0; i < count; i++) {
            const sprayAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const dist = Phaser.Math.Between(15, 45);
            const drop = currentScene.add.ellipse(startX, startY, Phaser.Math.Between(5, 9), Phaser.Math.Between(2, 4), bloodColor, 0.95);
            drop.setRotation(sprayAngle).setDepth(25000); // 👈 Depth untouched

            currentScene.tweens.add({
                targets: drop,
                x: startX + Math.cos(sprayAngle) * dist,
                y: startY + Math.sin(sprayAngle) * dist + Phaser.Math.Between(8, 22),
                alpha: 0,
                duration: Phaser.Math.Between(200, 300),
                ease: "Cubic.easeOut",
                onComplete: () => drop.destroy()
            });
        }

        const puddleGfx = currentScene.add.graphics().setDepth(2); // 👈 Depth untouched
        puddleGfx.fillStyle(bloodColor, 0.88);
        const r = 8;
        puddleGfx.fillCircle(startX, startY + 24, r);
        puddleGfx.fillCircle(startX + r * 0.4, startY + 24 + r * 0.25, r * 0.7);
        puddleGfx.fillCircle(startX - r * 0.35, startY + 24 - r * 0.2, r * 0.6);

        currentScene.time.delayedCall(2000, () => {
            if (puddleGfx && puddleGfx.active) {
                currentScene.tweens.add({ targets: puddleGfx, alpha: 0, duration: 1000, onComplete: () => puddleGfx.destroy() });
            }
        });
    }

    public triggerCombatStance(durationMs: number = 350) {
        this.lastCombatActionTime = this.scene.time.now + durationMs;
        const pointer = this.scene.input.activePointer;
        this.isFacingLeft = pointer.worldX < this.x;
    }

    private lastBloodDripTime: number = 0;
    private lastRunDustTime: number = 0;

    private updateBleedingTrail(delta: number, isMoving: boolean) {
        // 🛑 STOP completely if HP >= 50 or dead!
        if (this.hp >= 50 || this.hp <= 0) return;

        const currentTime = this.scene.time.now;
        const isSevere = this.hp < 25; // 🩸 Severe bleeding below 25 HP

        // Rapid trailing when < 25 HP (every 140ms running), moderate when 25-49 HP
        const dripInterval = isSevere 
            ? (isMoving ? 140 : 250) 
            : (isMoving ? 380 : 700);

        if (currentTime - this.lastBloodDripTime >= dripInterval) {
            this.lastBloodDripTime = currentTime;
            this.spawnGroundBloodDrip(isSevere);
        }
    }

    private spawnGroundBloodDrip(isSevere: boolean = false) {
        const currentScene = this.scene;
        if (!currentScene || !currentScene.add || !currentScene.tweens) return;

        // 🦶 1. Spawn strictly at ground / foot level (NOT at stomach height!)
        const dripX = this.x + Phaser.Math.Between(-6, 6);
        const dripY = this.y - 2; // Right at the boot soles
        const color = isSevere ? 0x800000 : 0x990000;

        const dropW = isSevere ? Phaser.Math.Between(5, 7) : 4;
        const dropH = isSevere ? Phaser.Math.Between(3, 4) : 2;

        const droplet = currentScene.add.ellipse(dripX, dripY, dropW, dropH, color, 0.85);
        
        // 🔒 2. STRICT DEPTH: Always 1 layer UNDER the player's current depth!
        droplet.setDepth(Math.max(1, this.depth - 2));

        currentScene.tweens.add({
            targets: droplet,
            y: dripY + Phaser.Math.Between(2, 6), // Lands flat on grass
            scaleX: isSevere ? 1.3 : 1.1,
            scaleY: isSevere ? 0.8 : 0.6,
            duration: 60,
            ease: "Quad.easeIn"
        });

        // Dissolves cleanly after 2 seconds
        currentScene.time.delayedCall(2000, () => {
            if (droplet && droplet.active && currentScene.tweens) {
                currentScene.tweens.add({
                    targets: droplet,
                    alpha: 0,
                    duration: 600,
                    onComplete: () => droplet.destroy()
                });
            }
        });
    }

    // Location: inside src/player/Player.ts -> replace triggerThanosSnapDeath()
    private triggerThanosSnapDeath() {
        const currentScene = this.scene;
        if (!currentScene || !currentScene.add || !currentScene.tweens) return;

        // 🌑 1. Cinematic Black-and-White World Desaturation
        if (currentScene.cameras.main.postFX) {
            currentScene.cameras.main.postFX.addColorMatrix().grayscale(1.0);
        }

        // Hide weapons and shadow immediately
        if (this.pitchforkSprite) this.pitchforkSprite.setVisible(false);
        if (this.groundShadow) this.groundShadow.setVisible(false);

        // 🎩 2. REAL STRAW HAT ONLY (Zero Player Clones!)
        const hat = currentScene.add.ellipse(this.x, this.y - 35, 24, 12, 0xd69212);
        hat.setStrokeStyle(2, 0x8a5506).setDepth(35000);

        currentScene.tweens.add({
            targets: hat,
            x: this.x + Phaser.Math.Between(-30, 30),
            y: this.y + 12,
            angle: Phaser.Math.Between(180, 540),
            duration: 450,
            ease: "Bounce.easeOut",
            onComplete: () => {
                // Auto-destroys after 3s so it NEVER lingers on screen!
                currentScene.time.delayedCall(3000, () => {
                    if (hat && hat.active) hat.destroy();
                });
            }
        });

        // 💨 3. "Thanos Snap" Floating Ash Embers
        const ashColors = [0x555555, 0x888888, 0x333333, 0xaaaaaa];
        for (let i = 0; i < 28; i++) {
            const ashX = this.x + Phaser.Math.Between(-14, 14);
            const ashY = this.y + Phaser.Math.Between(-45, 0);
            const ash = currentScene.add.circle(ashX, ashY, Phaser.Math.Between(2, 4), Phaser.Math.RND.pick(ashColors));
            ash.setDepth(35000);

            currentScene.tweens.add({
                targets: ash,
                x: ashX + Phaser.Math.Between(-35, 35),
                y: ashY - Phaser.Math.Between(40, 90),
                alpha: 0,
                scale: 0.2,
                duration: Phaser.Math.Between(600, 1000),
                ease: "Cubic.easeOut",
                onComplete: () => ash.destroy()
            });
        }

        // Fade farmer into ash
        currentScene.tweens.add({
            targets: this,
            alpha: 0,
            duration: 300,
            ease: "Quad.easeIn"
        });
    }

    update(delta: number) {
    if (this.hp <= 0) return;

     // 🛡️ GUARANTEED VISIBILITY FAILSAFE (Prevents Player from going invisible!)
        if (!this.isDodging && !this.isInvulnerable && this.alpha < 1.0) {
            this.setAlpha(1.0);
        }
        if (this.pitchforkSprite && !this.pitchforkSprite.visible) {
            this.pitchforkSprite.setVisible(true);
        }

    if (this.isKnockedBack) {
        if (this.scene.time.now < this.knockbackTimer) return;
        else this.isKnockedBack = false;
    }

    if (this.groundShadow && this.groundShadow.active) {
        this.groundShadow.setPosition(this.x, this.y);
        this.groundShadow.setDepth(this.depth - 1);
        this.groundShadow.setScale(this.scaleY / this.baseScale, this.scaleY / this.baseScale);
    }

    if (this.isDodging) {
        if (this.scene.time.now < this.dodgeTimer) {
            this.setVelocity(this.dodgeDir.x * this.dodgeSpeed, this.dodgeDir.y * this.dodgeSpeed);
            this.setAlpha(0.6);
            return;
        } else {
            this.isDodging = false;
            this.setAlpha(1.0);
        }
    }

    if (this.isChargingRanged && this.chargeRing) {
        this.chargeRing.setPosition(this.x, this.y - 35);
        const heldDuration = this.scene.time.now - this.chargeStartTime;

        if (heldDuration >= 1000) {
            this.chargeRing.setStrokeStyle(3, 0xffff00);
            this.chargeRing.setFillStyle(0xff3300, 0.5);
        } else {
            const progress = heldDuration / 1000;
            this.chargeRing.setRadius(30 - progress * 12);
        }
    }

    // Direction Vector
    const direction = new Phaser.Math.Vector2(0, 0);
    if (this.keys.W.isDown) direction.y = -1;
    if (this.keys.S.isDown) direction.y = 1;
    if (this.keys.A.isDown) direction.x = -1;
    if (this.keys.D.isDown) direction.x = 1;

    const isMoving = direction.length() > 0;

    // Updates the injury blood trail when hurt
    this.updateBleedingTrail(delta, isMoving);

    // 💨 Subtle Rhythmic Running Dust
    if (isMoving && !this.isDodging && this.scene.time.now - this.lastRunDustTime >= 170) {
        this.lastRunDustTime = this.scene.time.now;
        this.spawnRunFootstepDust();
    }

    if (isMoving) {
        direction.normalize();
        this.dodgeDir.copy(direction);
    }

    const currentSpeed = this.isChargingRanged ? this.speed * 0.70 : this.speed;
    this.setVelocity(direction.x * currentSpeed, direction.y * currentSpeed);

    const mainScene = this.scene as any;
    if (mainScene.backpack) {
        mainScene.backpack.updateStamina(delta, isMoving);
    }

    // =========================================================================
    // 🎯 1. COMBAT & AIM LOCK LOGIC
    // =========================================================================
    const pointer = this.scene.input.activePointer;
    const isAttacking = (this.scene.time.now < this.lastCombatActionTime) || this.isChargingRanged || pointer.isDown;

    // Facing direction strictly follows cursor when in combat/aiming, or WASD when running
    if (isAttacking) {
        this.isFacingLeft = pointer.worldX < this.x;
    } else if (direction.x !== 0) {
        this.isFacingLeft = direction.x < 0;
    }

    // =========================================================================
    // 🗡️ CONTINUOUS MELEE THRUST (Hold Left-Click to keep stabbing = Flat 8 Stamina)
    // =========================================================================
    const isLeftClickHeld = pointer.isDown && pointer.leftButtonDown();
    
    // Strictly ensures Right-Click NEVER triggers melee!
    if (isLeftClickHeld && !this.isChargingRanged && !pointer.rightButtonDown()) {
        const mainScene = this.scene as any;
        if (!mainScene.isPlacingFence) {
            const chestY = this.y - (this.displayHeight * 0.45);
            // ⚡ Consumes flat 8 Stamina via Backpack
            const swung = this.weapon.attack(this.x, chestY, pointer, mainScene.backpack, true);
            if (swung) {
                this.lastMeleeAttackTime = this.scene.time.now;
                this.triggerCombatStance(250);
            }
        }
    }

    // =========================================================================
    // 🌿 2. HYBRID STATE MACHINE (Run -> Combat Side Stance -> Front Idle)
    // =========================================================================
    if (isMoving) {
        // 🏃 A. RUNNING: Plays 3-frame side walk loop
        if (this.anims && this.scene.anims.exists("walk-side")) {
            this.anims.play("walk-side", true);
        }
        this.setFlipX(this.isFacingLeft);

        this.animTimer += delta * 0.014;
        const trot = Math.sin(this.animTimer);
        const squashX = this.baseScale * (1.0 + Math.abs(trot) * 0.03);
        const squashY = this.baseScale * (1.0 - Math.abs(trot) * 0.04);
        this.setScale(squashX, squashY);

    } else if (isAttacking) {
        // ⚔️ B. COMBAT ACTION WHILE IDLE: Snaps to side combat stance facing cursor!
        if (this.anims) {
            this.anims.stop();
        }
        // Set to side-profile combat frame
        if (this.scene.textures.exists("player_side")) {
            this.setTexture("player_side", 0);
        }
        this.setFlipX(this.isFacingLeft);
        this.setScale(this.baseScale, this.baseScale);

    } else {
        // 🌿 IDLE STATE: 100% Crisp, Locked Vector Outlines (Zero Micro-Scale Jitter!)
        if (this.anims) {
            this.anims.stop();
        }
        if (this.texture.key !== "player_idle" && this.scene.textures.exists("player_idle")) {
            this.setTexture("player_idle");
        }
        this.setFlipX(this.isFacingLeft);

        // 🔒 Locked scale: Eliminates all edge vibration/shimmering completely!
        this.setScale(this.baseScale, this.baseScale);
    }
    }

    private syncPitchforkPosition() {
        if (!this.pitchforkSprite || !this.pitchforkSprite.active) return;

        const isMoving = this.body ? this.body.velocity.length() > 0 : false;
        const pointer = this.scene.input.activePointer;
        const isAttacking = (this.scene.time.now < this.lastCombatActionTime) || pointer.isDown;

        const squashFactor = this.scaleY / this.baseScale;
        const originY = this.isFacingLeft ? 0.75 : 0.25;
        this.pitchforkSprite.setOrigin(0.2, originY);

        const shoulderX = this.x + (this.isFacingLeft ? -0 : 0);
        const shoulderY = this.y - (55 * squashFactor);

        if (this.isMeleeSwinging || isAttacking) {
            this.pitchforkSprite.setVisible(true).setPosition(shoulderX, shoulderY).setDepth(this.depth + 2).setFlipY(this.isFacingLeft);
        } else if (isMoving) {
            // 🗡️ Tilted upward in a ready "V" carry angle (~20° upward)
            const carryAngle = this.isFacingLeft ? Math.PI + 0.35 : -0.35;
            this.pitchforkSprite.setVisible(true).setPosition(shoulderX, shoulderY).setRotation(carryAngle).setDepth(this.depth + 1).setFlipY(this.isFacingLeft);
        } else {
            this.pitchforkSprite.setVisible(false);
        }
    }

    private spawnRunFootstepDust() {
        const footX = this.x + (this.isFacingLeft ? 8 : -8) + Phaser.Math.Between(-3, 3);
        const footY = this.y - 2;

        // 🌾 Organic Footstep: Dark earth crumb & soft meadow mist
        const stepColor = Phaser.Math.RND.pick([0x382314, 0x4e6b2c, 0x8aa848]);
        const puff = this.scene.add.circle(footX, footY, Phaser.Math.Between(2, 3.5), stepColor, 0.65);
        puff.setDepth(2);

        this.scene.tweens.add({
            targets: puff,
            y: footY - Phaser.Math.Between(3, 7),
            x: footX + (this.isFacingLeft ? 6 : -6),
            scale: 1.4,
            alpha: 0,
            duration: 220,
            ease: "Quad.easeOut",
            onComplete: () => puff.destroy()
        });
    }
}