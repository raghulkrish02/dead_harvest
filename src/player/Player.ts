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
            if (mainScene.isPlacingFence) return;

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
            this.playShootRecoil(pointer, false);
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

        this.initInputs(scene);
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

        this.setTint(0xff0000);
        this.scene.time.delayedCall(100, () => {
            if (this.active) this.clearTint();
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

        if (this.groundShadow) this.groundShadow.setVisible(true);

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
        if (this.isDodging || !mainScene.backpack.consumeStamina(45)) return;

        this.isDodging = true;
        this.dodgeTimer = this.scene.time.now + this.dodgeDuration;
        this.cancelRangedCharge();

        // 💨 1. GHOST AFTER-IMAGE SHADOW TRAIL (Zero Pinwheel Spin!)
        const spawnGhost = () => {
            if (!this.active || !this.isDodging) return;
            const ghost = this.scene.add.sprite(this.x, this.y, this.texture.key, this.frame.name);
            ghost.setOrigin(this.originX, this.originY);
            ghost.setScale(this.scaleX, this.scaleY);
            ghost.setFlipX(this.flipX);
            ghost.setTint(0x00ffff); // Cyan speed shadow
            ghost.setAlpha(0.6);
            ghost.setDepth(this.depth - 1);

            this.scene.tweens.add({
                targets: ghost,
                alpha: 0,
                scaleX: this.scaleX * 0.9,
                duration: 220,
                ease: "Quad.easeOut",
                onComplete: () => ghost.destroy()
            });
        };

        // Spawns 3 fast ghost shadows during the 180ms dash
        spawnGhost();
        this.scene.time.delayedCall(60, spawnGhost);
        this.scene.time.delayedCall(120, spawnGhost);

        // Screen Shake & Dust
        this.scene.cameras.main.shake(50, 0.002);
        for (let i = 0; i < 4; i++) {
            const dust = this.scene.add.circle(this.x + Phaser.Math.Between(-8, 8), this.y - 4, Phaser.Math.Between(3, 5), 0xddccaa, 0.7);
            dust.setDepth(this.y - 1);
            this.scene.tweens.add({
                targets: dust,
                scale: 0.2,
                alpha: 0,
                duration: 250,
                onComplete: () => dust.destroy()
            });
        }
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
        const count = 20;
        const startX = this.x;
        const startY = this.y - 30;

        for (let i = 0; i < count; i++) {
            const sprayAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const dist = Phaser.Math.Between(8, 24);

            const dropW = Phaser.Math.Between(3, 6);
            const dropH = Phaser.Math.Between(2, 3);
            const droplet = currentScene.add.ellipse(startX, startY, dropW, dropH, bloodColor, 0.95);
            droplet.setRotation(sprayAngle);
            droplet.setDepth(2);

            const targetX = startX + Math.cos(sprayAngle) * dist;
            const targetY = startY + Math.sin(sprayAngle) * dist + Phaser.Math.Between(6, 16);

            currentScene.tweens.add({
                targets: droplet,
                x: targetX,
                y: targetY,
                duration: Phaser.Math.Between(150, 250),
                ease: "Cubic.easeOut",
                onComplete: () => droplet.destroy()
            });
        }

        const puddleGfx = currentScene.add.graphics();
        puddleGfx.setDepth(2);
        puddleGfx.fillStyle(bloodColor, 0.85);

        const r = 6;
        puddleGfx.fillCircle(0, 0, r);
        puddleGfx.fillCircle(r * 0.35, r * 0.25, r * 0.65);
        puddleGfx.fillCircle(-r * 0.25, -r * 0.2, r * 0.55);

        puddleGfx.setPosition(startX, startY + 24);
        puddleGfx.setScale(0.3);

        currentScene.tweens.add({
            targets: puddleGfx,
            scaleX: 1.0,
            scaleY: 0.75,
            duration: 120,
            ease: "Quad.easeOut"
        });

        currentScene.time.delayedCall(2000, () => {
            if (puddleGfx && puddleGfx.active && currentScene.tweens) {
                currentScene.tweens.add({
                    targets: puddleGfx,
                    alpha: 0,
                    duration: 1000,
                    onComplete: () => puddleGfx.destroy()
                });
            }
        });
    }

    public triggerCombatStance(durationMs: number = 350) {
        this.lastCombatActionTime = this.scene.time.now + durationMs;
        const pointer = this.scene.input.activePointer;
        this.isFacingLeft = pointer.worldX < this.x;
    }

    private lastBloodDripTime: number = 0;

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

        const dripX = this.x + Phaser.Math.Between(-8, 8);
        const dripY = this.y - 12;
        const color = isSevere ? 0x800000 : 0x990000;

        // Larger droplet size if in critical severe bleeding (<25 HP)
        const dropW = isSevere ? Phaser.Math.Between(6, 9) : 5;
        const dropH = isSevere ? Phaser.Math.Between(4, 5) : 3;

        const droplet = currentScene.add.ellipse(dripX, dripY, dropW, dropH, color, 0.9);
        droplet.setDepth(25000);

        currentScene.tweens.add({
            targets: droplet,
            y: dripY + Phaser.Math.Between(8, 16),
            scaleX: isSevere ? 1.6 : 1.3,
            scaleY: isSevere ? 0.9 : 0.7,
            duration: 70,
            ease: "Quad.easeIn"
        });

        // Dissolves after 2 seconds
        currentScene.time.delayedCall(2000, () => {
            if (droplet && droplet.active && currentScene.tweens) {
                currentScene.tweens.add({
                    targets: droplet,
                    alpha: 0,
                    duration: 800,
                    onComplete: () => droplet.destroy()
                });
            }
        });
    }



    update(delta: number) {
        if (this.hp <= 0) return;

        

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
        // 🗡️ CONTINUOUS MELEE THRUST (Hold Left-Click to keep stabbing = 12 Stamina)
        // =========================================================================
        const isLeftClickHeld = pointer.isDown && pointer.leftButtonDown();
        
        // Strictly ensures Right-Click NEVER triggers melee!
        if (isLeftClickHeld && !this.isChargingRanged && !pointer.rightButtonDown()) {
            const mainScene = this.scene as any;
            if (!mainScene.isPlacingFence) {
                const chestY = this.y - (this.displayHeight * 0.45);
                // ⚡ Passes true -> Consumes 12 Stamina for continuous hold combo
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
}