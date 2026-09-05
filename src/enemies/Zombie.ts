import Phaser from "phaser";
import type { IFenceData } from "../world/Fence";
import { FenceManager } from "../world/Fence";

export type ZombieType = "WALKER" | "RUNNER" | "BRUTE" | "TITAN";

export default class Zombie extends Phaser.Physics.Arcade.Sprite {
    public zombieType: ZombieType;
    public hp: number = 30;
    public maxHp: number = 30;
    public isKnockedBack: boolean = false;
    public lastHitSource: "MELEE" | "RANGED" = "MELEE";

    public speed: number = 90;
    public slowMultiplier: number = 1.0;
    public slowTimer: number = 0;
    private playerDamageTimer: number = 0;
    private playerAttackCooldown: number = 1000;
    private playerChewDamage: number = 10;

    // Fence Attack
    private fenceAttackTimer: number = 0;
    private fenceAttackCooldown: number = 800;
    private fenceHitDamage: number = 15;
    private defaultTint: number = 0x55aa55;

    // Mini HP Bar
    private hpBarBg!: Phaser.GameObjects.Rectangle;
    private hpBarFill!: Phaser.GameObjects.Rectangle;
    private barWidth: number = 26;

    // 👑 TITAN BOSS PROPERTIES
    public isBoss: boolean = false;
    public isArmorCrackedPhase1: boolean = false;
    public isArmorCrackedPhase2: boolean = false;
    public isEnraged: boolean = false;

    private bossState: "CHASE" | "CHARGE_WINDUP" | "CHARGING" | "SLAM_WINDUP" = "CHASE";
    private nextBossSpecialTime: number = 0;
    private chargeVector: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private slamWarningCircle?: Phaser.GameObjects.Arc;

    public currentTargetFence?: IFenceData;
    private smartNavTarget?: { x: number; y: number };
    private nextPathCheckTime: number = 0;


    // 🩸 PERSISTENT BODY WOUND OVERLAYS
    private bodyBloodStains: { shape: Phaser.GameObjects.Ellipse; offsetX: number; offsetY: number }[] = [];

    constructor(scene: Phaser.Scene, x: number, y: number, type: ZombieType = "WALKER") {
         super(scene, x, y, scene.textures.exists("zombie_walker") ? "zombie_walker" : "player", 0);

        this.zombieType = type;

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setCollideWorldBounds(true);
        this.setOrigin(0.5, 1.0);

        this.applyTypeStats();
        this.createHPBar(scene);

        this.createZombieAnimations(scene);
    }

    private applyTypeStats() {
        switch (this.zombieType) {
            case "RUNNER":
                this.hp = 15;
                this.maxHp = 15;
                this.speed = 195;
                this.playerChewDamage = 8;
                this.playerAttackCooldown = 650;
                this.fenceAttackCooldown = 500;
                this.fenceHitDamage = 8;
                this.barWidth = 20;
                this.defaultTint = 0xddaa22; // Sickly fast runner yellow
                
                // 🏃 Precise Runner Feet Hitbox (Scale 0.42):
                this.setScale(0.42);
                this.body?.setSize(52, 22);
                this.body?.setOffset(64, 140);
                break;

            case "BRUTE":
                this.hp = 90;
                this.maxHp = 90;
                this.speed = 70;
                this.playerChewDamage = 25;
                this.playerAttackCooldown = 1200;
                this.fenceAttackCooldown = 900;
                this.fenceHitDamage = 45;
                this.barWidth = 38;
                // 🧟 Cold Ashen Necrotic Tint (Stops turning into muddy brown sludge!)
                this.defaultTint = 0x6688aa;
                
                // 🛡️ Broad Heavy Brute Feet Hitbox (Scale 0.72):
                this.setScale(0.72);
                this.body?.setSize(70, 32);
                this.body?.setOffset(64, 140);
                break;

            case "TITAN":
                this.isBoss = true;
                this.hp = 450;
                this.maxHp = 450;
                this.speed = 115;
                this.playerChewDamage = 35;
                this.playerAttackCooldown = 1200;
                this.fenceAttackCooldown = 800;
                this.fenceHitDamage = 60;
                this.barWidth = 0;
                this.defaultTint = 0x442211;
                
                // 👑 Massive Titan Boss Feet Collider (Scale 1.2):
                this.setScale(1.2);
                this.body?.setSize(96, 44);
                this.body?.setOffset(64, 140);
                this.nextBossSpecialTime = this.scene.time.now + 800;
                break;

            case "WALKER":
            default:
                this.hp = 30;
                this.maxHp = 30;
                this.speed = 90;
                this.playerChewDamage = 12;
                this.playerAttackCooldown = 900;
                this.fenceAttackCooldown = 800;
                this.fenceHitDamage = 15;
                this.barWidth = 26;
                this.defaultTint = 0xffffff; // Natural Walker Vector Colors
                
                // 🧟 Solid Walker Feet Hitbox (Scale 0.50):
                this.setScale(0.50);
                this.body?.setSize(64, 24);
                this.body?.setOffset(64, 160);
                break;
        }

        this.setTint(this.defaultTint);
    }


    private createHPBar(scene: Phaser.Scene) {
        if (this.barWidth === 0) return;

        this.hpBarBg = scene.add.rectangle(this.x, this.y, this.barWidth + 2, 5, 0x000000, 0.85);
        this.hpBarBg.setStrokeStyle(1, 0x222222);
        this.hpBarBg.setOrigin(0.5, 0.5).setDepth(20000).setVisible(false);

        this.hpBarFill = scene.add.rectangle(this.x - (this.barWidth / 2), this.y, this.barWidth, 3, 0x00ff44);
        this.hpBarFill.setOrigin(0, 0.5).setDepth(20001).setVisible(false);
    }

    private updateHPBar() {
        if (!this.hpBarBg || !this.hpBarFill || !this.active || this.barWidth === 0) return;

        const headY = this.y - this.displayHeight - 6;
        this.hpBarBg.setPosition(this.x, headY);
        this.hpBarFill.setPosition(this.x - (this.barWidth / 2), headY);

        const pct = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
        this.hpBarFill.displayWidth = this.barWidth * pct;

        if (pct > 0.5) this.hpBarFill.setFillStyle(0x00ff44);
        else if (pct > 0.25) this.hpBarFill.setFillStyle(0xffaa00);
        else this.hpBarFill.setFillStyle(0xff2222);

        if (this.hp < this.maxHp && this.hp > 0) {
            this.hpBarBg.setVisible(true);
            this.hpBarFill.setVisible(true);
        }
    }

    public takeDamage(amount: number, knockbackDir: Phaser.Math.Vector2, force: number, source: "MELEE" | "RANGED" = "MELEE") {
        this.lastHitSource = source;
        let actualDamage = amount;

        // 🛡️ 1. TITAN TWO-PHASE ARMOR LOGIC
        if (this.zombieType === "TITAN") {
            if (source === "MELEE" && amount >= 40) {
                if (!this.isEnraged && !this.isArmorCrackedPhase1) {
                    this.isArmorCrackedPhase1 = true;
                    (this.scene as any).showFloatingText?.(this.x, this.y - 120, "🛡️ BARK ARMOR CRACKED!", "#55ff55", 2500);
                } else if (this.isEnraged && !this.isArmorCrackedPhase2) {
                    this.isArmorCrackedPhase2 = true;
                    (this.scene as any).showFloatingText?.(this.x, this.y - 120, "💥 MOLTEN ARMOR SHATTERED!", "#ffaa00", 2500);
                }
            }

            const isArmored = (!this.isEnraged && !this.isArmorCrackedPhase1) || (this.isEnraged && !this.isArmorCrackedPhase2);
            if (source === "RANGED" && isArmored) {
                actualDamage = Math.max(1, Math.floor(amount * 0.5));
            }
        }

        this.hp = Math.max(0, this.hp - actualDamage);
        this.updateHPBar();

        // 👑 2. 50% HP ENRAGE (At 225 HP)
        if (this.zombieType === "TITAN" && !this.isEnraged && this.hp <= 225) {
            this.isEnraged = true;
            this.speed = 140;
            this.defaultTint = 0xff5500;
            (this.scene as any).showFloatingText?.(this.x, this.y - 130, "🔥 TITAN ENRAGED! MOLTEN BARK REGROWN!", "#ff3300", 3000);
            this.scene.cameras.main.shake(160, 0.01);
        }

        this.setTint(0xffffff);
        this.scene.time.delayedCall(80, () => {
            if (this.active) this.setTint(this.defaultTint);
        });

        this.showDamageText(actualDamage);
        this.spawnDamageBloodSpray(knockbackDir);
        this.addZombieBloodStain();

        if (this.bossState !== "CHARGING") {
            let effectiveForce = force;
            if (this.zombieType === "TITAN") effectiveForce = force * 0.02;
            else if (this.zombieType === "BRUTE") effectiveForce = force * 0.25;

            this.isKnockedBack = true;
            this.setVelocity(knockbackDir.x * effectiveForce, knockbackDir.y * effectiveForce);

            this.scene.time.delayedCall(160, () => {
                this.isKnockedBack = false;
            });
        }

        if (this.hp <= 0) {
            this.dropLoot(this.lastHitSource);
            if (this.slamWarningCircle) this.slamWarningCircle.destroy();

            // 💥 1. BRUTAL GORE BLAST & FLYING FLESH GIBS
            this.spawnDeathGoreExplosion(knockbackDir);

            this.destroy();
            return;
        }
    }

    public applySlow(multiplier: number = 0.60, durationMs: number = 600) {
        this.slowMultiplier = multiplier;
        this.slowTimer = this.scene.time.now + durationMs;
        this.setTint(0x66ccff);
    }

    private addZombieBloodStain() {
        if (!this.scene || this.bodyBloodStains.length >= 6) return;

        const halfH = this.displayHeight / 2;
        const offsetX = Phaser.Math.Between(-8, 8);
        const offsetY = Phaser.Math.Between(-halfH * 0.5, halfH * 0.3);
        const patchW = Phaser.Math.Between(5, 10);
        const patchH = Phaser.Math.Between(3, 6);

        const color = this.zombieType === "TITAN" ? 0x220000 : (this.zombieType === "BRUTE" ? 0x440000 : 0x550000);
        const stain = this.scene.add.ellipse(this.x + offsetX, this.y - halfH + offsetY, patchW, patchH, color, 0.9);
        stain.setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2));
        stain.setDepth(this.depth + 1);

        this.bodyBloodStains.push({ shape: stain, offsetX, offsetY });
    }

    private updateBloodStains() {
        const halfH = this.displayHeight / 2;
        for (let i = 0; i < this.bodyBloodStains.length; i++) {
            const entry = this.bodyBloodStains[i];
            if (entry.shape && entry.shape.active) {
                entry.shape.setPosition(this.x + entry.offsetX, this.y - halfH + entry.offsetY);
                entry.shape.setDepth(this.depth + 1);
            }
        }
    }

    private dropLoot(source: "MELEE" | "RANGED") {
        const mainScene = this.scene as any;
        const boss = mainScene.waveManager?.activeBoss;
        const backpack = mainScene.backpack;

        // 🛡️ Strict 1-Spore Cap: Drops ONLY if 0 [Q] charges AND no spore is already lying on the ground!
        const hasSporeOnField = mainScene.rootSpores && mainScene.rootSpores.length > 0;
        if (!this.isBoss && boss && boss.active && boss.hp > 0 && backpack && backpack.rootCharges === 0 && !hasSporeOnField) {
            const isArmored = (!boss.isEnraged && !boss.isArmorCrackedPhase1) || (boss.isEnraged && !boss.isArmorCrackedPhase2);
            if (isArmored && Math.random() < 0.50) {
                this.spawnRootSporeOrb(this.x, this.y);
                return; // 👈 Drops ONLY the spore (0 Biomass from this minion!)
            }
        }

        if (this.zombieType === "TITAN") {
            for (let i = 0; i < 5; i++) {
                const angle = Phaser.Math.DegToRad(i * 72);
                this.spawnBiomassOrb(this.x + Math.cos(angle) * 24, this.y + Math.sin(angle) * 24);
            }
            return;
        }

        if (this.zombieType === "BRUTE") {
            this.spawnBiomassOrb(this.x - 8, this.y);
            this.spawnBiomassOrb(this.x + 8, this.y);
            return;
        }

        const dropChance = source === "MELEE" ? 0.60 : 0.40;
        if (Math.random() < dropChance) {
            this.spawnBiomassOrb(this.x, this.y);
        }
    }

    private spawnBiomassOrb(x: number, y: number) {
        if (!this.scene) return;
        const currentScene = this.scene as any;

        // 🌿 1. Soft Ambient Ground Light Pool (Depth 1)
        const groundLight = this.scene.add.ellipse(x, y + 8, 28, 12, 0x00ff77, 0.22);
        groundLight.setBlendMode(Phaser.BlendModes.ADD).setDepth(1);
        this.scene.tweens.add({
            targets: groundLight,
            scaleX: 1.35,
            scaleY: 1.35,
            alpha: 0.08,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
        });

        // 🌟 2. Additive Breathing Halo (Depth 3: Sits on top of blood puddles at depth 2)
        const aura = this.scene.add.circle(x, y - 2, 14, 0x11ee55, 0.25);
        aura.setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
        this.scene.tweens.add({
            targets: aura,
            scale: 1.4,
            alpha: 0.08,
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
        });

        // 🪐 3. Tilted Celestial Orbital Ring
        const orbitalRing = this.scene.add.ellipse(x, y - 2, 24, 8, 0x44ffaa, 0.55);
        orbitalRing.setRotation(-0.45).setStrokeStyle(1.5, 0xffffff, 0.7).setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
        this.scene.tweens.add({
            targets: orbitalRing,
            scaleX: 0.85,
            scaleY: 1.2,
            duration: 850,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
        });

        // 💎 4. 3D Emerald Sphere Body (Depth 3: Never gets buried by blood!)
        const emerald = this.scene.add.sprite(x, y - 2, "biomass_emerald");
        emerald.setOrigin(0.5, 0.5).setScale(0.95).setDepth(3);

        this.scene.physics.add.existing(emerald);
        const body = emerald.body as Phaser.Physics.Arcade.Body;
        if (body) body.setAllowGravity(false);
        emerald.setData("type", "biomass");
        emerald.setData("amount", 1);
        emerald.setData("aura", aura);
        emerald.setData("groundLight", groundLight);
        emerald.setData("orbitalRing", orbitalRing);

        // ✨ 5. Revolving 3D Surface Light Glint
        const glint = this.scene.add.circle(x - 4, y - 5, 2.5, 0xffffff);
        glint.setDepth(4);
        emerald.setData("glint", glint);

        // Glint sweeps horizontally across the sphere surface in an elliptical orbit
        let glintAngle = { rad: 0 };
        const glintTween = this.scene.tweens.add({
            targets: glintAngle,
            rad: Math.PI * 2,
            duration: 1400,
            repeat: -1,
            onUpdate: () => {
                if (!emerald.active || !glint.active) {
                    glintTween.remove(); // 👈 Stops the ghost tween permanently on collection!
                    return;
                }
                // Sweeps X across sphere (-5.5px to +5.5px) and dims at the back horizon
                const cosA = Math.cos(glintAngle.rad);
                const sinA = Math.sin(glintAngle.rad);
                glint.x = emerald.x + cosA * 5.5;
                glint.y = emerald.y - 3 + sinA * 2.2;
                // Bright on front face, fades as it turns around the back of the sphere
                glint.setAlpha(Phaser.Math.Clamp(0.5 + sinA * 0.5, 0.15, 1.0));
                glint.setScale(Phaser.Math.Clamp(0.7 + sinA * 0.4, 0.4, 1.1));
            }
        });

        // 🕊️ Floating Vertical Hover for Entire System
        this.scene.tweens.add({
            targets: [emerald, aura, orbitalRing],
            y: y - 8,
            duration: 650,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
        });

        if (currentScene.biomassGroup) {
            currentScene.biomassGroup.add(emerald);
        }
    }

    private spawnRootSporeOrb(x: number, y: number) {
        const mainScene = this.scene as any;
        if (!mainScene) return;

        // Glowing Emerald Root Spore (Depth 2 on Grass)
        const spore = this.scene.add.circle(x, y, 8, 0x33ff66);
        spore.setStrokeStyle(2.5, 0xffffff).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
        spore.setData("type", "root_spore");

        // Gentle breathing pulse
        this.scene.tweens.add({
            targets: spore,
            scale: 1.35,
            duration: 400,
            yoyo: true,
            repeat: -1
        });

        // Register to scene for zero-lag instant pickup
        if (mainScene.registerRootSpore) {
            mainScene.registerRootSpore(spore);
        }
    }

    private showDamageText(amount: number, color: string = "#ff3333") {
        const headTopY = this.y - this.displayHeight - 10;
        const dmgText = this.scene.add.text(
            this.x + Phaser.Math.Between(-8, 8),
            headTopY,
            `-${amount}`,
            {
                fontFamily: "Arial",
                fontSize: this.zombieType === "TITAN" ? "18px" : (this.zombieType === "BRUTE" ? "15px" : "13px"),
                color: color,
                stroke: "#000000",
                strokeThickness: 3,
            }
        ).setOrigin(0.5).setDepth(20000);

        this.scene.tweens.add({
            targets: dmgText,
            y: dmgText.y - 22,
            alpha: 0,
            duration: 900,
            ease: "Power2",
            onComplete: () => dmgText.destroy(),
        });
    }

    private spawnDamageBloodSpray(knockbackDir: Phaser.Math.Vector2) {
        const currentScene = this.scene;
        if (!currentScene || !currentScene.add || !currentScene.tweens) return;

        const count = this.zombieType === "TITAN" ? 24 : (this.zombieType === "BRUTE" ? 16 : 10);
        const bloodColor = this.zombieType === "TITAN" ? 0x4a0000 : (this.zombieType === "BRUTE" ? 0x6b0000 : 0x8a0303);
        const startX = this.x;
        const startY = this.y - (this.displayHeight / 2);

        for (let i = 0; i < count; i++) {
            const spreadAngle = Phaser.Math.DegToRad(Phaser.Math.Between(-25, 25));
            const sprayVec = knockbackDir.clone().rotate(spreadAngle);

            const drop = currentScene.add.ellipse(startX, startY, Phaser.Math.Between(7, 12), Phaser.Math.Between(3, 5), bloodColor, 0.95);
            drop.setRotation(Phaser.Math.Angle.Between(0, 0, sprayVec.x, sprayVec.y));
            drop.setDepth(this.y + 1); // 👈 Visible in front of zombie body

            const travelDist = Phaser.Math.Between(30, 75);
            const targetX = startX + sprayVec.x * travelDist;
            const targetY = startY + sprayVec.y * travelDist + Phaser.Math.Between(8, 20);

            currentScene.tweens.add({
                targets: drop,
                x: targetX,
                y: targetY,
                duration: Phaser.Math.Between(350, 480),
                ease: "Cubic.easeOut",
                onComplete: () => drop.destroy()
            });
        }
    }





    public attackFence(fence: IFenceData, fenceManager: FenceManager, _playerX?: number, _playerY?: number) {
        if (!this.active || this.hp <= 0 || !fence || fence.state !== "INTACT") return;

        // 🛡️ CRITICAL FIX: If actively navigating around a gap, DO NOT stop to chew the wall!
        if (this.smartNavTarget) {
            return; // Slide around the corner through the gap!
        }

        this.currentTargetFence = fence;
        this.executeFenceAttack(fence, fenceManager);
    }

    private executeFenceAttack(fence: IFenceData, fenceManager: FenceManager) {
        const currentTime = this.scene.time.now;
        if (currentTime > this.fenceAttackTimer) {
            this.fenceAttackTimer = currentTime + this.fenceAttackCooldown;

            // Deal chew damage to fence
            const destroyed = fenceManager.damageFence(fence.gridX, fence.gridY, this.fenceHitDamage);
            if (destroyed) {
                this.currentTargetFence = undefined;
            }

            // Snappy chewing bite animation
            this.scene.tweens.add({
                targets: this,
                scaleX: this.scaleX * 1.12,
                scaleY: this.scaleY * 0.9,
                duration: 70,
                yoyo: true
            });
        }
    }


    // Location: inside src/enemies/Zombie.ts -> replace handleDirectionalAnimation()
    private handleDirectionalAnimation(angle: number) {
        if (!this.anims || !this.scene || !this.scene.anims) return;

        const deg = Phaser.Math.RadToDeg(angle);

        // 🔄 1. Clean Horizontal Flip (Faces Left when moving left, Right when moving right)
        const isMovingLeft = (deg > 90 || deg < -90);
        this.setFlipX(isMovingLeft);

        // ⏱️ 2. Dynamic Speed Multiplier by Zombie Archetype
        if (this.zombieType === "RUNNER") {
            this.anims.timeScale = 1.6; // Rapid charging stride
        } else if (this.zombieType === "BRUTE") {
            this.anims.timeScale = 0.75; // Heavy menacing stomp
        } else if (this.zombieType === "TITAN") {
            this.anims.timeScale = this.bossState === "CHARGING" ? 2.0 : 0.85;
        } else {
            this.anims.timeScale = 1.0; // Steady walker shambling
        }

        // 🎬 3. Play the 3-Frame Walker Stride Loop
        if (this.scene.anims.exists("walker-walk")) {
            this.anims.play("walker-walk", true);
        }
    }

    public update(playerX: number, playerY: number) {
        if (!this.active) return;
        this.updateHPBar();
        this.updateBloodStains();
        if (this.isKnockedBack) return;

        if (this.scene.time.now > this.slowTimer) {
            this.slowMultiplier = 1.0;
            if (this.active && !this.isKnockedBack) this.setTint(this.defaultTint);
        }

        const effectiveSpeed = this.speed * this.slowMultiplier;
        const currentTime = this.scene.time.now;
        const distanceToPlayer = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);

        // 👑 TITAN BOSS AI
        if (this.zombieType === "TITAN") {
            this.updateTitanBossAI(playerX, playerY, distanceToPlayer);
            return;
        }

        // 🩸 1. ATTACK PLAYER ON DIRECT CONTACT
        const attackRange = this.zombieType === "BRUTE" ? 55 : 42;
        if (distanceToPlayer <= attackRange) {
            this.setVelocity(0, 0);
            if (this.scene?.anims?.exists("idle-down")) {
                this.anims?.play("idle-down", true);
            }

            if (currentTime > this.playerDamageTimer) {
                const mainScene = this.scene as any;
                if (mainScene.player && mainScene.player.takeDamage) {
                    this.playClawSwipeFX(playerX, playerY - 30);
                    mainScene.player.takeDamage(this.playerChewDamage);
                }
                this.playerDamageTimer = currentTime + this.playerAttackCooldown;
            }
            return;
        }

        const mainScene = this.scene as any;

        // 🧠 2. PROACTIVE PATH / SIEGE EVALUATOR (Evaluates every 250ms)
        if (mainScene.fenceManager && currentTime > this.nextPathCheckTime && this.zombieType !== "BRUTE") {
            this.nextPathCheckTime = currentTime + 250;

            const pathResult = mainScene.fenceManager.findSmartPathOrFence(this.x, this.y, playerX, playerY, 8);

            if (pathResult.gap) {
                // Gap exists -> Flank around the wall!
                this.smartNavTarget = pathResult.gap;
                this.currentTargetFence = undefined;
            } else if (pathResult.blockingFence) {
                // Completely blocked wall -> Lock and destroy!
                this.currentTargetFence = pathResult.blockingFence;
                this.smartNavTarget = undefined;
            } else {
                // Path clear
                this.smartNavTarget = undefined;
                this.currentTargetFence = undefined;
            }
        }

        // 🚪 3. NAVIGATE THROUGH GAP (Flanks around fence corners)
        if (this.smartNavTarget) {
            const distToGap = Phaser.Math.Distance.Between(this.x, this.y, this.smartNavTarget.x, this.smartNavTarget.y);

            if (distToGap > 20) {
                const angleToGap = Phaser.Math.Angle.Between(this.x, this.y, this.smartNavTarget.x, this.smartNavTarget.y);
                this.setVelocity(Math.cos(angleToGap) * effectiveSpeed, Math.sin(angleToGap) * effectiveSpeed);
                this.handleDirectionalAnimation(angleToGap);
                return;
            } else {
                // Reached opening! Resume hunting player directly
                this.smartNavTarget = undefined;
            }
        }

        // 🔨 4. SIEGE WALL BREAKER (Only for dead-end closed boxes!)
        if (this.currentTargetFence && this.currentTargetFence.state === "INTACT") {
            const fenceWorldX = this.currentTargetFence.gridX * 40 + 20;
            const fenceWorldY = this.currentTargetFence.gridY * 40 + 20;
            const distToFence = Phaser.Math.Distance.Between(this.x, this.y, fenceWorldX, fenceWorldY);

            if (distToFence <= 52) {
                this.setVelocity(0, 0); // Stop running into wall
                this.executeFenceAttack(this.currentTargetFence, mainScene.fenceManager);
                return;
            } else {
                const angleToFence = Phaser.Math.Angle.Between(this.x, this.y, fenceWorldX, fenceWorldY);
                this.setVelocity(Math.cos(angleToFence) * effectiveSpeed, Math.sin(angleToFence) * effectiveSpeed);
                this.handleDirectionalAnimation(angleToFence);
                return;
            }
        }

        // 🏃 5. DIRECT PLAYER CHASE (Default)
        const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
        this.setVelocity(Math.cos(angle) * effectiveSpeed, Math.sin(angle) * effectiveSpeed);
        this.handleDirectionalAnimation(angle);
    }

    private updateTitanBossAI(playerX: number, playerY: number, distance: number) {
        const currentTime = this.scene.time.now;
        const mainScene = this.scene as any;

        if (this.bossState === "CHARGING") {
            this.setTint(0xff1111);
            const rushSpeed = this.isEnraged ? 360 : 320;
            this.setVelocity(this.chargeVector.x * rushSpeed, this.chargeVector.y * rushSpeed);
            this.handleDirectionalAnimation(Phaser.Math.Angle.Between(0, 0, this.chargeVector.x, this.chargeVector.y));

            if (mainScene.player && mainScene.player.body) {
                const bossRamBox = new Phaser.Geom.Rectangle(this.x - 22, (this.y - 40) - 22, 44, 44);
                const pBox = new Phaser.Geom.Rectangle(mainScene.player.x - 14, (mainScene.player.y - 35) - 18, 28, 36);

                if (Phaser.Geom.Intersects.RectangleToRectangle(bossRamBox, pBox) && !this.getData("rammedPlayerThisCharge")) {
                    this.setData("rammedPlayerThisCharge", true);
                    mainScene.player.takeDamage(35);
                    mainScene.player.applyKnockback(this.chargeVector.x, this.chargeVector.y, 480, 220);
                    this.scene.cameras.main.shake(220, 0.015);
                    mainScene.showFloatingText?.(mainScene.player.x, mainScene.player.y - 90, "💥 THOOKI ADICHIFIED!", "#ff3333", 1500);
                }
            }

            if (mainScene.waveManager) {
                const activeZombies: Zombie[] = mainScene.waveManager.getActiveZombies();
                activeZombies.forEach((zombie) => {
                    if (zombie && zombie.active && zombie !== this && !zombie.getData("trampledThisCharge")) {
                        const distToZombie = Phaser.Math.Distance.Between(this.x, this.y - 20, zombie.x, zombie.y - (zombie.displayHeight / 2));
                        if (distToZombie <= 75) {
                            zombie.setData("trampledThisCharge", true);
                            const trampleDmg = Phaser.Math.Between(1, 2);
                            const flingVec = new Phaser.Math.Vector2(-this.chargeVector.y, this.chargeVector.x).normalize();
                            zombie.takeDamage(trampleDmg, flingVec, 260, "MELEE");
                        }
                    }
                });
            }

            if (mainScene.fenceManager) {
                const gridX = Math.floor(this.x / 40);
                const gridY = Math.floor(this.y / 40);
                mainScene.fenceManager.damageFence(gridX, gridY, 100);
            }
            return;
        }

        if (this.bossState === "SLAM_WINDUP") {
            this.setVelocity(0, 0);
            return;
        }

        if (this.bossState === "CHASE" && distance <= 90 && currentTime > this.nextBossSpecialTime) {
            this.bossState = "SLAM_WINDUP";
            this.setVelocity(0, 0);
            if (this.scene?.anims?.exists("idle-down")) {
                this.anims?.play("idle-down", true);
            }
            this.nextBossSpecialTime = currentTime + 4500;

            this.slamWarningCircle = this.scene.add.circle(this.x, this.y - 45, 10, 0xff0000, 0.4);
            this.slamWarningCircle.setStrokeStyle(3, 0xff3333).setDepth(2);

            this.scene.tweens.add({
                targets: this.slamWarningCircle,
                radius: 100,
                alpha: 0.75,
                duration: 800,
                ease: "Cubic.easeOut",
                onComplete: () => {
                    this.executeGroundSlam();
                }
            });
            return;
        }

        if (this.bossState === "CHASE" && distance > 70 && currentTime > this.nextBossSpecialTime) {
            this.bossState = "CHARGE_WINDUP";
            this.setVelocity(0, 0);
            this.nextBossSpecialTime = currentTime + 5000;

            this.setTint(0xff0000);
            (this.scene as any).showFloatingText?.(this.x, this.y - 120, "⚠️ TITAN BULL RUSH!", "#ff3333", 800);

            const chargeAngle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
            this.chargeVector.set(Math.cos(chargeAngle), Math.sin(chargeAngle));

            this.scene.time.delayedCall(600, () => {
                if (!this.active || this.hp <= 0) return;
                this.bossState = "CHARGING";
                this.setData("rammedPlayerThisCharge", false);

                if (mainScene.waveManager) {
                    mainScene.waveManager.getActiveZombies().forEach(z => z.setData("trampledThisCharge", false));
                }

                this.scene.time.delayedCall(1100, () => {
                    if (this.active && this.bossState === "CHARGING") {
                        this.bossState = "CHASE";
                        this.setTint(this.defaultTint);
                        this.setVelocity(0, 0);
                    }
                });
            });
            return;
        }

        if (this.bossState === "CHASE") {
            const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
            this.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
            this.handleDirectionalAnimation(angle);

            if (distance <= 60) {
                if (currentTime > this.playerDamageTimer) {
                    if (mainScene.player && mainScene.player.takeDamage) {
                        mainScene.player.takeDamage(this.playerChewDamage);
                    }
                    this.playerDamageTimer = currentTime + this.playerAttackCooldown;
                }
            }
        }
    }

    private executeGroundSlam() {
        if (!this.active || this.hp <= 0) return;
        this.slamWarningCircle?.destroy();
        this.bossState = "CHASE";
        this.setTint(this.defaultTint);

        this.scene.cameras.main.shake(200, 0.015);

        const slamX = this.x;
        const slamY = this.y - 45;
        const slamRadius = 100;

        const slamRing = this.scene.add.circle(slamX, slamY, slamRadius, 0x884422, 0.6);
        slamRing.setStrokeStyle(4, 0xff5500).setDepth(2);
        this.scene.tweens.add({
            targets: slamRing,
            scale: 1.3,
            alpha: 0,
            duration: 350,
            onComplete: () => slamRing.destroy()
        });

        // 🦶 STRICT FEET/LEG CONTACT ONLY (Ignores head/air space!)
        const mainScene = this.scene as any;
        if (mainScene.player && mainScene.player.body) {
            const pBody = mainScene.player.body as Phaser.Physics.Arcade.Body;
            const playerFeetBox = new Phaser.Geom.Rectangle(pBody.x, pBody.y, pBody.width, pBody.height);
            const slamCircle = new Phaser.Geom.Circle(slamX, slamY, slamRadius);

            if (Phaser.Geom.Intersects.CircleToRectangle(slamCircle, playerFeetBox)) {
                mainScene.player.takeDamage(40);
                const knockDir = new Phaser.Math.Vector2(mainScene.player.x - slamX, mainScene.player.y - slamY).normalize();
                mainScene.player.applyKnockback(knockDir.x, knockDir.y, 350, 180);
            }
        }

        if (mainScene.fenceManager) {
            const gridX = Math.floor(this.x / 40);
            const gridY = Math.floor(this.y / 40);
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    mainScene.fenceManager.damageFence(gridX + dx, gridY + dy, 100);
                }
            }
        }
    }

    public destroy(fromScene?: boolean) {
        if (this.hpBarBg) this.hpBarBg.destroy();
        if (this.hpBarFill) this.hpBarFill.destroy();
        if (this.slamWarningCircle) this.slamWarningCircle.destroy();
        this.bodyBloodStains.forEach(s => s.shape.destroy());
        this.bodyBloodStains = [];
        super.destroy(fromScene);
    }

    private createZombieAnimations(scene: Phaser.Scene) {
        if (scene.anims.exists("walker-walk")) return;

        if (scene.textures.exists("zombie_walker")) {
            scene.anims.create({
                key: "walker-walk",
                frames: scene.anims.generateFrameNumbers("zombie_walker", { frames: [0, 1, 2, 1] }),
                frameRate: 5, // Shambling zombie cadence
                repeat: -1
            });
        }
    }

    private spawnDeathGoreExplosion(knockbackDir: Phaser.Math.Vector2) {
        const currentScene = this.scene;
        if (!currentScene || !currentScene.add || !currentScene.tweens) return;

        const startX = this.x;
        const startY = this.y - (this.displayHeight / 2);
        const goreColor = this.zombieType === "TITAN" ? 0x440000 : (this.zombieType === "BRUTE" ? 0x770000 : 0xaa0a0a);

        const meatTint = this.zombieType === "TITAN" ? 0x331808 
            : (this.zombieType === "BRUTE" ? 0x6688aa 
            : (this.zombieType === "RUNNER" ? 0xddaa22 : 0xffffff));

        const gibBaseScale = this.zombieType === "TITAN" ? 2.2 : (this.zombieType === "BRUTE" ? 1.45 : 0.95);

        // 💥 Radial Blood Burst
        const dropCount = this.zombieType === "TITAN" ? 36 : (this.zombieType === "BRUTE" ? 28 : 20);
        for (let i = 0; i < dropCount; i++) {
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.Between(180, 420);

            const drop = currentScene.add.ellipse(startX, startY, Phaser.Math.Between(8, 14), Phaser.Math.Between(3, 5), goreColor, 0.95);
            drop.setRotation(angle).setDepth(startY + 20);

            const targetX = startX + Math.cos(angle) * (speed * 0.45);
            const targetY = startY + Math.sin(angle) * (speed * 0.45) + Phaser.Math.Between(10, 30);

            currentScene.tweens.add({
                targets: drop,
                x: targetX,
                y: targetY,
                duration: Phaser.Math.Between(240, 340),
                ease: "Cubic.easeOut",
                onComplete: () => drop.destroy()
            });
        }

        // 🍖 3. GIB ERUPTION & DEDICATED SEPARATE LANDING SPLATTERS (Not merged with puddle!)
        const totalGibs = 5;
        const hasGibTexture = currentScene.textures.exists("zombie_gibs");
        const hitAngle = Math.atan2(knockbackDir.y, knockbackDir.x);
        const puddleY = this.y + 16;

        // Separate, independent graphics layer dedicated strictly for gib crash splatters
        const gibsLandingGfx = currentScene.add.graphics().setDepth(2);

        for (let g = 0; g < totalGibs; g++) {
            const gibAngle = hitAngle + Phaser.Math.FloatBetween(-1.3, 1.3);
            const travelDist = Phaser.Math.Between(45, 105);
            const landX = startX + Math.cos(gibAngle) * travelDist;
            const landY = puddleY + Math.sin(gibAngle) * (travelDist * 0.55) + 12;
            const apexY = startY - Phaser.Math.Between(40, 75);
            const frameIndex = Phaser.Math.RND.pick([0, 1, 2]);

            let gib: Phaser.GameObjects.Sprite | Phaser.GameObjects.Shape;
            if (hasGibTexture) {
                const spriteGib = currentScene.add.sprite(startX, startY, "zombie_gibs", frameIndex);
                spriteGib.setScale(gibBaseScale);
                if (frameIndex === 0) spriteGib.setTint(meatTint);
                gib = spriteGib;
            } else {
                gib = currentScene.add.ellipse(startX, startY, 14 * gibBaseScale, 7 * gibBaseScale, goreColor);
            }
            // 🦴 Gibs Depth: Above blood drips (2), below biomass orbs (3), and behind trees
            (gib as any).setDepth(2.5);

            currentScene.tweens.add({
                targets: gib,
                x: landX,
                angle: Phaser.Math.Between(400, 1080),
                duration: 580,
                ease: "Quad.easeOut"
            });

            currentScene.tweens.add({
                targets: gib,
                y: apexY,
                duration: 220,
                ease: "Cubic.easeOut",
                onComplete: () => {
                    if (!gib.active) return;
                    currentScene.tweens.add({
                        targets: gib,
                        y: landY,
                        duration: 360,
                        ease: "Bounce.easeOut",
                        onComplete: () => {
                            if (!gib.active) return;

                            // 💥 SEPARATE Organic Landing Splat (Dedicated layer, completely distinct from puddle!)
                            const r = Phaser.Math.Between(6, 10) * (gibBaseScale * 0.7);
                            gibsLandingGfx.fillStyle(0x260202, 0.9);
                            gibsLandingGfx.fillCircle(landX, landY + 3, r + 1.5);
                            gibsLandingGfx.fillStyle(goreColor, 0.88);
                            gibsLandingGfx.fillCircle(landX, landY + 3, r);

                            for (let s = 0; s < 2; s++) {
                                const sa = Phaser.Math.FloatBetween(0, Math.PI * 2);
                                const sd = r * Phaser.Math.FloatBetween(1.2, 1.7);
                                gibsLandingGfx.fillStyle(goreColor, 0.85);
                                gibsLandingGfx.fillCircle(landX + Math.cos(sa) * sd, landY + 3 + Math.sin(sa) * sd * 0.6, 2.0);
                            }

                            currentScene.time.delayedCall(2500, () => {
                                if (gib && gib.active) {
                                    currentScene.tweens.add({ targets: gib, alpha: 0, duration: 800, onComplete: () => gib.destroy() });
                                }
                            });
                        }
                    });
                }
            });
        }

        // Dedicated gib splatter layer dissolves with its own fade
        currentScene.time.delayedCall(3500, () => {
            if (gibsLandingGfx && gibsLandingGfx.active) {
                currentScene.tweens.add({ targets: gibsLandingGfx, alpha: 0, duration: 1200, onComplete: () => gibsLandingGfx.destroy() });
            }
        });

        // 🩸 Original Fused Organic Ground Zero Puddle (Depth 2)
        const puddleGfx = currentScene.add.graphics();
        puddleGfx.setDepth(2);
        puddleGfx.fillStyle(goreColor, 0.88);

        const coreR = (this.zombieType === "TITAN" ? 22 : (this.zombieType === "BRUTE" ? 16 : 11));
        puddleGfx.fillCircle(0, 0, coreR);
        puddleGfx.fillCircle(coreR * 0.4, coreR * 0.3, coreR * 0.75);
        puddleGfx.fillCircle(-coreR * 0.35, -coreR * 0.2, coreR * 0.65);
        puddleGfx.fillCircle(coreR * 0.2, -coreR * 0.4, coreR * 0.7);

        for (let d = 0; d < 4; d++) {
            const dripAng = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const dripDist = coreR * Phaser.Math.FloatBetween(1.2, 1.9);
            puddleGfx.fillCircle(Math.cos(dripAng) * dripDist, Math.sin(dripAng) * dripDist, coreR * 0.35);
        }

        puddleGfx.setPosition(startX, startY + 16);

        currentScene.time.delayedCall(3000, () => {
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

    private playClawSwipeFX(targetX: number, targetY: number) {
        const claw = this.scene.add.graphics();
        claw.setPosition(targetX, targetY - 6).setDepth(30000); // 👈 Depth untouched

        // ⚔️ 3 Razor-sharp curved crimson claws
        claw.lineStyle(3.5, 0xff1111, 1.0);
        for (let i = -1; i <= 1; i++) {
            const off = i * 9;
            claw.beginPath();
            claw.moveTo(-16 + off, -18);
            claw.lineTo(10 + off, 16);
            claw.strokePath();
        }

        // Downward tearing sweep
        this.scene.tweens.add({
            targets: claw,
            y: targetY + 10,
            scaleX: 1.3,
            scaleY: 1.4,
            alpha: 0,
            duration: 160,
            ease: "Expo.easeOut",
            onComplete: () => claw.destroy()
        });

        // 🩸 Wound Blood Mist: Micro-droplets spray out from the slash laceration
        for (let b = 0; b < 4; b++) {
            const sprayAng = Phaser.Math.FloatBetween(0.2, 1.2);
            const drop = this.scene.add.ellipse(targetX, targetY, Phaser.Math.Between(4, 7), 2.5, 0x990000, 0.9);
            drop.setRotation(sprayAng).setDepth(25000); // 👈 Depth untouched

            this.scene.tweens.add({
                targets: drop,
                x: targetX + Math.cos(sprayAng) * Phaser.Math.Between(15, 30),
                y: targetY + Math.sin(sprayAng) * Phaser.Math.Between(15, 30),
                scaleX: 0.2,
                alpha: 0,
                duration: 200,
                ease: "Cubic.easeOut",
                onComplete: () => drop.destroy()
            });
        }
    }
}