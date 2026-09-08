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
    private shadow!: Phaser.GameObjects.Image;
    private shadowOffsetY: number = -6;
    private shadowOffsetX: number = 0;

    // 👑 TITAN BOSS PROPERTIES
    public isBoss: boolean = false;
    public isArmorCrackedPhase1: boolean = false;
    public isArmorCrackedPhase2: boolean = false;
    public isEnraged: boolean = false;

    private bossState: "CHASE" | "CHARGE_WINDUP" | "CHARGING" | "SLAM_WINDUP" = "CHASE";
    private nextBossSpecialTime: number = 0;
    private chargeVector: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
    private slamWarningCircle?: Phaser.GameObjects.Arc;

    // 🐙 Pure Procedural Living Boss Rig (Batched Texture-Backed Images)
    private bossCore?: Phaser.GameObjects.Image;
    private bossAura?: Phaser.GameObjects.Image;
    private bossArmorPlates: Phaser.GameObjects.Image[] = [];
    private bossTentacles: { nodes: Phaser.GameObjects.Image[]; baseAngle: number }[] = [];
    // 👁️ Pure 2.5D Volumetric Blight Eye Rig (0 GPU lag, zero strokes)
    private bossEyeSocket?: Phaser.GameObjects.Image;
    private bossEyeIris?: Phaser.GameObjects.Image;
    private bossEyePupil?: Phaser.GameObjects.Image;
    private bossAnimTimer: number = 0;
    private isBossRigBuilt: boolean = false;
    private nextGhostTrailTime: number = 0;

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

        this.createShadow(scene);
        this.applyTypeStats();
        this.createHPBar(scene);
        this.createZombieAnimations(scene);

        // Post-Update sync eliminates 100% of knockback tracking delay
        scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncShadowPosition, this);
    }

    private createShadow(scene: Phaser.Scene) {
        if (!scene.textures.exists("blob_shadow")) {
            const gfx = scene.make.graphics({ x: 0, y: 0 });
            gfx.fillStyle(0x000000, 0.38);
            gfx.fillEllipse(24, 11, 44, 18);
            gfx.generateTexture("blob_shadow", 48, 22);
            gfx.destroy();
        }

        this.shadow = scene.add.image(this.x, this.y + this.shadowOffsetY, "blob_shadow");
        this.shadow.setOrigin(0.5, 0.5).setDepth(1);
    }

    private syncShadowPosition() {
        if (!this.active || !this.shadow || !this.shadow.active) return;
        const strideCenterX = this.flipX ? 6 : -6;
        this.shadow.setPosition(this.x + strideCenterX, this.y + this.shadowOffsetY);
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
                this.defaultTint = 0xddaa22;
                
                this.setScale(0.42);
                this.body?.setSize(52, 22);
                this.body?.setOffset(64, 140);
                this.shadowOffsetY = -5;
                if (this.shadow) this.shadow.setScale(0.75, 0.65);
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
                this.defaultTint = 0x6688aa;
                
                this.setScale(0.72);
                this.body?.setSize(70, 32);
                this.body?.setOffset(64, 140);
                this.shadowOffsetY = -10;
                if (this.shadow) this.shadow.setScale(1.35, 1.15);
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

                // 🎯 Exact 1:1 Hitbox Lock: 96x96 box perfectly encloses the (x, y - 45) core!
                this.setScale(1.0);
                this.body?.setSize(96, 96);
                this.body?.setOffset(48, 99);
                this.nextBossSpecialTime = this.scene.time.now + 800;

                this.setAlpha(0);
                this.createBossVisualRig();
                this.shadowOffsetY = -14;
                if (this.shadow) this.shadow.setScale(2.6, 1.8);
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
                this.defaultTint = 0xffffff;
                
                this.setScale(0.50);
                this.body?.setSize(64, 24);
                this.body?.setOffset(64, 160);
                this.shadowOffsetY = -7;
                if (this.shadow) this.shadow.setScale(1.0, 0.85);
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

        // ⚡ Visual Hit Confirmation on Procedural Boss Core
        if (this.isBoss && this.bossCore) {
            this.bossCore.setTint(0xffffff);
            this.bossAura?.setAlpha(0.85);
            this.bossArmorPlates.forEach(p => p.setTint(0xffffff));
            if (this.bossEyeIris) this.bossEyeIris.setTint(0xffffff);
            if (this.bossEyeSocket) this.bossEyeSocket.setTint(0xff5555); // Flashes the root nerves!
            // Snappy 50ms hit flash prevents visual freeze
            this.scene.time.delayedCall(50, () => {
                if (!this.active || !this.bossCore) return;
                const coreTint = this.isEnraged ? 0xffaa00 : 0xff3300;
                this.bossCore.setTint(coreTint);
                this.bossAura?.setAlpha(this.isEnraged ? 0.60 : 0.45);
                if (this.bossEyeIris) this.bossEyeIris.setTint(this.isEnraged ? 0xffff44 : 0xff3300);
                if (this.bossEyeSocket) this.bossEyeSocket.setTint(this.isEnraged ? 0xff8866 : 0xffffff);
            });
        } else {
            this.setTint(0xffffff);
            this.scene.time.delayedCall(80, () => {
                if (this.active) this.setTint(this.defaultTint);
            });
        }

        this.showDamageText(actualDamage);
        // 🪵 Normal zombies bleed; the Armored Boss does NOT spray human blood!
        if (!this.isBoss) {
            this.spawnDamageBloodSpray(knockbackDir);
            // Only add body wound stickers if zombie survives the hit (saves 15 allocations on horde wipe!)
            if (this.hp > 0) {
                this.addZombieBloodStain();
            }
        }

        if (this.bossState !== "CHARGING") {
            let effectiveForce = force;
            if (this.zombieType === "TITAN") effectiveForce = force * 0.015;
            else if (this.zombieType === "BRUTE") effectiveForce = force * 0.25;

            this.isKnockedBack = true;
            this.setVelocity(knockbackDir.x * effectiveForce, knockbackDir.y * effectiveForce);

            // Reduced hitstop: 40ms for Titan eliminates jerky combat freezing
            const knockDuration = this.zombieType === "TITAN" ? 40 : 160;
            this.scene.time.delayedCall(knockDuration, () => {
                this.isKnockedBack = false;
            });
        }

        if (this.hp <= 0) {
            this.dropLoot(this.lastHitSource);
            if (this.slamWarningCircle) this.slamWarningCircle.destroy();

            // 👑 Boss gets a mythical celestial cataclysm; normal zombies get gore!
            if (this.isBoss) {
                this.spawnBossDeathCataclysm();
            } else {
                this.spawnDeathGoreExplosion(knockbackDir);
            }

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
        // 🚫 No floating blood stickers on the procedural boss!
        if (this.isBoss || !this.scene || this.bodyBloodStains.length >= 6) return;

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
                return;
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

        const glint = this.scene.add.circle(x - 4, y - 5, 2.5, 0xffffff);
        glint.setDepth(4);
        emerald.setData("glint", glint);

        let glintAngle = { rad: 0 };
        const glintTween = this.scene.tweens.add({
            targets: glintAngle,
            rad: Math.PI * 2,
            duration: 1400,
            repeat: -1,
            onUpdate: () => {
                if (!emerald.active || !glint.active) {
                    glintTween.remove();
                    return;
                }
                const cosA = Math.cos(glintAngle.rad);
                const sinA = Math.sin(glintAngle.rad);
                glint.x = emerald.x + cosA * 5.5;
                glint.y = emerald.y - 3 + sinA * 2.2;
                glint.setAlpha(Phaser.Math.Clamp(0.5 + sinA * 0.5, 0.15, 1.0));
                glint.setScale(Phaser.Math.Clamp(0.7 + sinA * 0.4, 0.4, 1.1));
            }
        });

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

        const spore = this.scene.add.circle(x, y, 8, 0x33ff66);
        spore.setStrokeStyle(2.5, 0xffffff).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
        spore.setData("type", "root_spore");

        this.scene.tweens.add({
            targets: spore,
            scale: 1.35,
            duration: 400,
            yoyo: true,
            repeat: -1
        });

        if (mainScene.registerRootSpore) {
            mainScene.registerRootSpore(spore);
        }
    }

    // Static timestamp to prevent 15 Canvas text textures from generating in 1 frame
    private static lastDmgTextTime: number = 0;

    private showDamageText(amount: number, color: string = "#ff3333") {
        const now = this.scene.time.now;
        // Allows damage text on boss or throttles crowd numbers to max 1 text per 40ms
        if (!this.isBoss && now - Zombie.lastDmgTextTime < 40) return;
        Zombie.lastDmgTextTime = now;

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
            duration: 800,
            ease: "Power2",
            onComplete: () => dmgText.destroy(),
        });
    }

    private spawnDamageBloodSpray(knockbackDir: Phaser.Math.Vector2) {
        const currentScene = this.scene;
        if (!currentScene || !currentScene.add || !currentScene.tweens) return;

        const count = this.zombieType === "TITAN" ? 24 : (this.zombieType === "BRUTE" ? 16 : 10);
        const startX = this.x;
        const startY = this.y - (this.displayHeight / 2);

        // 💥 All droplets preserved, batched into 1 single tween allocation!
        const drops: Phaser.GameObjects.Ellipse[] = [];

        for (let i = 0; i < count; i++) {
            const spreadAngle = Phaser.Math.DegToRad(Phaser.Math.Between(-25, 25));
            const sprayVec = knockbackDir.clone().rotate(spreadAngle);
            const bloodColor = i % 2 === 0 ? 0x8a0303 : 0x4a0000;

            const drop = currentScene.add.ellipse(startX, startY, Phaser.Math.Between(7, 12), Phaser.Math.Between(3, 5), bloodColor, 0.95);
            drop.setRotation(Phaser.Math.Angle.Between(0, 0, sprayVec.x, sprayVec.y));
            drop.setDepth(this.y + 1);

            const travelDist = Phaser.Math.Between(30, 75);
            drop.setData("tx", startX + sprayVec.x * travelDist);
            drop.setData("ty", startY + sprayVec.y * travelDist + Phaser.Math.Between(8, 20));
            drops.push(drop);
        }

        // 🚀 1 Single Batched Tween for all droplets (Cuts 24 tweens to 1!)
        currentScene.tweens.add({
            targets: drops,
            x: (target: any) => target.getData("tx"),
            y: (target: any) => target.getData("ty"),
            alpha: 0,
            duration: Phaser.Math.Between(350, 480),
            ease: "Cubic.easeOut",
            onComplete: () => {
                drops.forEach(d => { if (d && d.active) d.destroy(); });
            }
        });
    }

    public attackFence(fence: IFenceData, fenceManager: FenceManager, _playerX?: number, _playerY?: number) {
        if (!this.active || this.hp <= 0 || !fence || fence.state !== "INTACT") return;

        if (this.smartNavTarget) {
            return;
        }

        this.currentTargetFence = fence;
        this.executeFenceAttack(fence, fenceManager);
    }

    private executeFenceAttack(fence: IFenceData, fenceManager: FenceManager) {
        const currentTime = this.scene.time.now;
        if (currentTime > this.fenceAttackTimer) {
            this.fenceAttackTimer = currentTime + this.fenceAttackCooldown;

            const destroyed = fenceManager.damageFence(fence.gridX, fence.gridY, this.fenceHitDamage);
            if (destroyed) {
                this.currentTargetFence = undefined;
            }

            this.scene.tweens.add({
                targets: this,
                scaleX: this.scaleX * 1.12,
                scaleY: this.scaleY * 0.9,
                duration: 70,
                yoyo: true
            });
        }
    }

    private handleDirectionalAnimation(angle: number) {
        if (!this.anims || !this.scene || !this.scene.anims) return;

        const deg = Phaser.Math.RadToDeg(angle);
        const isMovingLeft = (deg > 90 || deg < -90);
        this.setFlipX(isMovingLeft);

        if (this.zombieType === "RUNNER") {
            this.anims.timeScale = 1.6;
        } else if (this.zombieType === "BRUTE") {
            this.anims.timeScale = 0.75;
        } else if (this.zombieType === "TITAN") {
            this.anims.timeScale = this.bossState === "CHARGING" ? 2.0 : 0.85;
        } else {
            this.anims.timeScale = 1.0;
        }

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

        if (this.zombieType === "TITAN") {
            this.updateTitanBossAI(playerX, playerY, distanceToPlayer);
            return;
        }

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

        if (mainScene.fenceManager && currentTime > this.nextPathCheckTime && this.zombieType !== "BRUTE") {
            this.nextPathCheckTime = currentTime + 250;
            const pathResult = mainScene.fenceManager.findSmartPathOrFence(this.x, this.y, playerX, playerY, 8);

            if (pathResult.gap) {
                this.smartNavTarget = pathResult.gap;
                this.currentTargetFence = undefined;
            } else if (pathResult.blockingFence) {
                this.currentTargetFence = pathResult.blockingFence;
                this.smartNavTarget = undefined;
            } else {
                this.smartNavTarget = undefined;
                this.currentTargetFence = undefined;
            }
        }

        if (this.smartNavTarget) {
            const distToGap = Phaser.Math.Distance.Between(this.x, this.y, this.smartNavTarget.x, this.smartNavTarget.y);
            if (distToGap > 20) {
                const angleToGap = Phaser.Math.Angle.Between(this.x, this.y, this.smartNavTarget.x, this.smartNavTarget.y);
                this.setVelocity(Math.cos(angleToGap) * effectiveSpeed, Math.sin(angleToGap) * effectiveSpeed);
                this.handleDirectionalAnimation(angleToGap);
                return;
            } else {
                this.smartNavTarget = undefined;
            }
        }

        if (this.currentTargetFence && this.currentTargetFence.state === "INTACT") {
            const fenceWorldX = this.currentTargetFence.gridX * 40 + 20;
            const fenceWorldY = this.currentTargetFence.gridY * 40 + 20;
            const distToFence = Phaser.Math.Distance.Between(this.x, this.y, fenceWorldX, fenceWorldY);

            if (distToFence <= 52) {
                this.setVelocity(0, 0);
                this.executeFenceAttack(this.currentTargetFence, mainScene.fenceManager);
                return;
            } else {
                const angleToFence = Phaser.Math.Angle.Between(this.x, this.y, fenceWorldX, fenceWorldY);
                this.setVelocity(Math.cos(angleToFence) * effectiveSpeed, Math.sin(angleToFence) * effectiveSpeed);
                this.handleDirectionalAnimation(angleToFence);
                return;
            }
        }

        const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
        this.setVelocity(Math.cos(angle) * effectiveSpeed, Math.sin(angle) * effectiveSpeed);
        this.handleDirectionalAnimation(angle);
    }

    private updateTitanBossAI(playerX: number, playerY: number, distance: number) {
        const currentTime = this.scene.time.now;
        const mainScene = this.scene as any;

        this.bossAnimTimer += 0.05;

        // 🐙 Update Procedural Living Octopus Rig
        this.updateBossVisualRig(playerX, playerY, distance);

        if (this.bossState === "CHARGING") {
            const rushSpeed = this.isEnraged ? 360 : 320;
            this.setVelocity(this.chargeVector.x * rushSpeed, this.chargeVector.y * rushSpeed);

            if (mainScene.player && mainScene.player.active && !this.getData("rammedPlayerThisCharge")) {
                // 360° Reliable Radial Dash Hitbox (Center-to-Center)
                const distToPlayer = Phaser.Math.Distance.Between(this.x, this.y - 45, mainScene.player.x, mainScene.player.y - 30);
                if (distToPlayer <= 75) {
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

            if (mainScene.trapManager) {
                const trap = mainScene.trapManager.getTrapAtWorldPos(this.x, this.y);
                if (trap && trap.type === "BARREL") {
                    mainScene.trapManager.detonateBarrel(trap, mainScene.waveManager.getActiveZombies());
                }
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
                mainScene.waveManager.getActiveZombies().forEach((z: any) => z.setData("trampledThisCharge", false));
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

        this.scene.cameras.main.shake(260, 0.02);

        const slamX = this.x;
        const slamY = this.y - 45;
        const slamRadius = 115;

        // 💥 1. Dual Additive Shockwaves (Magma Flame + Concussive White Wave)
        const outerWave = this.scene.add.circle(slamX, slamY, 16, 0xff3300, 0.9);
        outerWave.setStrokeStyle(6, 0xffaa00).setBlendMode(Phaser.BlendModes.ADD).setDepth(2);
        this.scene.tweens.add({
            targets: outerWave,
            radius: slamRadius,
            alpha: 0,
            duration: 420,
            ease: "Expo.easeOut",
            onComplete: () => outerWave.destroy()
        });

        const innerFlash = this.scene.add.circle(slamX, slamY, 20, 0xffffff, 0.95);
        innerFlash.setBlendMode(Phaser.BlendModes.ADD).setDepth(2);
        this.scene.tweens.add({
            targets: innerFlash,
            radius: 60,
            alpha: 0,
            duration: 220,
            ease: "Quad.easeOut",
            onComplete: () => innerFlash.destroy()
        });

        // 🌿 2. Earthquake Fissure Cracks (Soil splits open on depth 2)
        const crackGfx = this.scene.add.graphics().setDepth(2);
        crackGfx.lineStyle(3, 0xff4400, 0.85);
        crackGfx.beginPath();
        for (let f = 0; f < 6; f++) {
            const fAngle = (f / 6) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
            const len = Phaser.Math.Between(40, slamRadius * 0.9);
            crackGfx.moveTo(slamX, slamY);
            crackGfx.lineTo(slamX + Math.cos(fAngle) * (len * 0.5), slamY + Math.sin(fAngle) * (len * 0.35));
            crackGfx.lineTo(slamX + Math.cos(fAngle) * len, slamY + Math.sin(fAngle) * (len * 0.65));
        }
        crackGfx.strokePath();

        this.scene.tweens.add({
            targets: crackGfx,
            alpha: 0,
            delay: 400,
            duration: 1600,
            ease: "Quad.easeOut",
            onComplete: () => crackGfx.destroy()
        });

        // 🪨 3. Erupting Flying Soil Debris Chunks
        for (let d = 0; d < 8; d++) {
            const dAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const dDist = Phaser.Math.Between(25, slamRadius * 0.8);
            const rock = this.scene.add.ellipse(slamX, slamY, Phaser.Math.Between(6, 10), Phaser.Math.Between(4, 7), 0x3d2314);
            rock.setDepth(this.y + 1);

            this.scene.tweens.add({
                targets: rock,
                x: slamX + Math.cos(dAngle) * dDist,
                y: slamY + Math.sin(dAngle) * dDist * 0.65 - Phaser.Math.Between(15, 35),
                scale: 0.2,
                alpha: 0,
                duration: Phaser.Math.Between(350, 500),
                ease: "Cubic.easeOut",
                onComplete: () => rock.destroy()
            });
        }

        // 🦶 STRICT FEET/LEG CONTACT DAMAGE
        const mainScene = this.scene as any;
        if (mainScene.player && mainScene.player.body) {
            const pBody = mainScene.player.body as Phaser.Physics.Arcade.Body;
            const playerFeetBox = new Phaser.Geom.Rectangle(pBody.x, pBody.y, pBody.width, pBody.height);
            const slamCircle = new Phaser.Geom.Circle(slamX, slamY, slamRadius);

            if (Phaser.Geom.Intersects.CircleToRectangle(slamCircle, playerFeetBox)) {
                mainScene.player.takeDamage(40);
                const knockDir = new Phaser.Math.Vector2(mainScene.player.x - slamX, mainScene.player.y - slamY).normalize();
                mainScene.player.applyKnockback(knockDir.x, knockDir.y, 380, 200);
            }
        }

        if (mainScene.trapManager) {
            const gridX = Math.floor(this.x / 40);
            const gridY = Math.floor(this.y / 40);
            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    const trap = mainScene.trapManager.getTrapAtWorldPos((gridX + dx) * 40 + 20, (gridY + dy) * 40 + 20);
                    if (trap && trap.type === "BARREL") {
                        mainScene.trapManager.detonateBarrel(trap, mainScene.waveManager.getActiveZombies());
                    }
                }
            }
        }
    }

    public destroy(fromScene?: boolean) {
        if (this.scene && this.scene.events) {
            this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncShadowPosition, this);
        }
        if (this.shadow) this.shadow.destroy();
        if (this.hpBarBg) this.hpBarBg.destroy();
        if (this.hpBarFill) this.hpBarFill.destroy();
        if (this.slamWarningCircle) this.slamWarningCircle.destroy();
        this.bodyBloodStains.forEach(s => s.shape.destroy());
        this.bodyBloodStains = [];

        // Clean up procedural boss rig
        if (this.bossCore) this.bossCore.destroy();
        if (this.bossAura) this.bossAura.destroy();
        if (this.bossEyeSocket) this.bossEyeSocket.destroy();
        if (this.bossEyeIris) this.bossEyeIris.destroy();
        if (this.bossEyePupil) this.bossEyePupil.destroy();
        this.bossArmorPlates.forEach(p => p.destroy());
        this.bossTentacles.forEach(t => t.nodes.forEach(n => n.destroy()));

        super.destroy(fromScene);
    }

    private spawnGhostTrail(x: number, y: number, depth: number) {
        if (!this.scene || !this.scene.add) return;
        const ghost = this.scene.add.image(x, y, "titan_core");
        ghost.setBlendMode(Phaser.BlendModes.ADD)
             .setDepth(depth)
             .setTint(this.isEnraged ? 0xffaa00 : 0x00ff66)
             .setAlpha(0.45)
             .setScale(1.05);

        this.scene.tweens.add({
            targets: ghost,
            alpha: 0,
            scale: 0.75,
            duration: 320,
            ease: "Cubic.easeOut",
            onComplete: () => ghost.destroy()
        });
    }
    private createZombieAnimations(scene: Phaser.Scene) {
        if (scene.anims.exists("walker-walk")) return;

        if (scene.textures.exists("zombie_walker")) {
            scene.anims.create({
                key: "walker-walk",
                frames: scene.anims.generateFrameNumbers("zombie_walker", { frames: [0, 1, 2, 1] }),
                frameRate: 5,
                repeat: -1
            });
        }
    }

    // =========================================================================
    // 👑 MYTHICAL BOSS DEATH CATACLYSM (Zero Meat Gibs / Zero Blood)
    // =========================================================================
    private spawnBossDeathCataclysm() {
        const currentScene = this.scene;
        if (!currentScene || !currentScene.add || !currentScene.tweens) return;

        const startX = this.x;
        const startY = this.y - 45;

        // 💥 Heavy Victory Earthquake Shake
        currentScene.cameras.main.shake(450, 0.025);

        // 1. Dual Expanding Celestial Shockwaves (Additive Sunburst)
        const wave = currentScene.add.circle(startX, startY, 20, 0xff7700, 0.95);
        wave.setStrokeStyle(8, 0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(25000);
        currentScene.tweens.add({
            targets: wave,
            radius: 240,
            alpha: 0,
            duration: 650,
            ease: "Expo.easeOut",
            onComplete: () => wave.destroy()
        });

        const emeraldWave = currentScene.add.circle(startX, startY, 24, 0x00ff66, 0.85);
        emeraldWave.setStrokeStyle(5, 0xaaffaa).setBlendMode(Phaser.BlendModes.ADD).setDepth(25000);
        currentScene.tweens.add({
            targets: emeraldWave,
            radius: 180,
            alpha: 0,
            duration: 500,
            ease: "Cubic.easeOut",
            onComplete: () => emeraldWave.destroy()
        });

        // 2. Shattering Wooden Bark Armor Shards
        for (let s = 0; s < 8; s++) {
            const sAngle = (s / 8) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
            const dist = Phaser.Math.Between(60, 140);
            const shard = currentScene.add.rectangle(startX, startY, Phaser.Math.Between(14, 22), Phaser.Math.Between(8, 16), 0x3d2314);
            shard.setStrokeStyle(2, 0xffaa00).setDepth(this.y + 1);

            currentScene.tweens.add({
                targets: shard,
                x: startX + Math.cos(sAngle) * dist,
                y: startY + Math.sin(sAngle) * (dist * 0.7) + 20,
                angle: Phaser.Math.Between(360, 1080),
                alpha: 0,
                scale: 0.2,
                duration: Phaser.Math.Between(550, 850),
                ease: "Cubic.easeOut",
                onComplete: () => shard.destroy()
            });
        }

        // 3. Ascending Curse-Breaking Light Motes (Drifting up to the sky)
        for (let m = 0; m < 24; m++) {
            const mAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const mDist = Phaser.Math.Between(20, 90);
            const mx = startX + Math.cos(mAngle) * mDist;
            const my = startY + Math.sin(mAngle) * mDist;

            const mote = currentScene.add.circle(mx, my, Phaser.Math.Between(3, 5), 0x55ffaa, 1.0);
            mote.setBlendMode(Phaser.BlendModes.ADD).setDepth(25001);

            currentScene.tweens.add({
                targets: mote,
                x: mx + Phaser.Math.Between(-30, 30),
                y: my - Phaser.Math.Between(60, 140), // Floats up to the sky!
                scale: 0.1,
                alpha: 0,
                duration: Phaser.Math.Between(900, 1500),
                ease: "Quad.easeOut",
                onComplete: () => mote.destroy()
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

        // =========================================================================
        // 💥 1. RADIAL BLOOD BURST (Full Counts Preserved, Streamlined Tweens)
        // =========================================================================
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

        // =========================================================================
        // 🩸 2. UNIFIED GORE GRAPHICS LAYER (Both Ground Zero & Gib Splatters)
        // =========================================================================
        const puddleY = this.y + 16;
        const hitAngle = Math.atan2(knockbackDir.y, knockbackDir.x);
        
        // Single WebGL draw target on depth 2 prevents buffer splitting
        const sharedGoreGfx = currentScene.add.graphics().setDepth(2);

        // --- Ground Zero Fused Puddle ---
        sharedGoreGfx.fillStyle(goreColor, 0.88);
        const coreR = (this.zombieType === "TITAN" ? 22 : (this.zombieType === "BRUTE" ? 16 : 11));
        sharedGoreGfx.fillCircle(startX, puddleY, coreR);
        sharedGoreGfx.fillCircle(startX + coreR * 0.4, puddleY + coreR * 0.3, coreR * 0.75);
        sharedGoreGfx.fillCircle(startX - coreR * 0.35, puddleY - coreR * 0.2, coreR * 0.65);
        sharedGoreGfx.fillCircle(startX + coreR * 0.2, puddleY - coreR * 0.4, coreR * 0.7);

        for (let d = 0; d < 4; d++) {
            const dripAng = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const dripDist = coreR * Phaser.Math.FloatBetween(1.2, 1.9);
            sharedGoreGfx.fillCircle(startX + Math.cos(dripAng) * dripDist, puddleY + Math.sin(dripAng) * dripDist, coreR * 0.35);
        }

        // =========================================================================
        // 🍖 3. MULTI-PIECE GIB ERUPTION & SEPARATE LANDING SPLATS
        // =========================================================================
        const totalGibs = 5;
        const hasGibTexture = currentScene.textures.exists("zombie_gibs");

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
            (gib as any).setDepth(2.5);

            // Horizontal & rotational flight
            currentScene.tweens.add({
                targets: gib,
                x: landX,
                angle: Phaser.Math.Between(400, 1080),
                duration: 580,
                ease: "Quad.easeOut"
            });

            // Vertical parabolic arc -> Landing splatter
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
                            if (!gib.active || !sharedGoreGfx.active) return;

                            // Paint landing splatter directly onto the shared depth: 2 layer
                            const r = Phaser.Math.Between(6, 10) * (gibBaseScale * 0.7);
                            sharedGoreGfx.fillStyle(0x260202, 0.9);
                            sharedGoreGfx.fillCircle(landX, landY + 3, r + 1.5);
                            sharedGoreGfx.fillStyle(goreColor, 0.88);
                            sharedGoreGfx.fillCircle(landX, landY + 3, r);

                            for (let s = 0; s < 2; s++) {
                                const sa = Phaser.Math.FloatBetween(0, Math.PI * 2);
                                const sd = r * Phaser.Math.FloatBetween(1.2, 1.7);
                                sharedGoreGfx.fillStyle(goreColor, 0.85);
                                sharedGoreGfx.fillCircle(landX + Math.cos(sa) * sd, landY + 3 + Math.sin(sa) * sd * 0.6, 2.0);
                            }

                            // Fade out gib sprite after pause
                            currentScene.time.delayedCall(2500, () => {
                                if (gib && gib.active) {
                                    currentScene.tweens.add({ 
                                        targets: gib, 
                                        alpha: 0, 
                                        duration: 800, 
                                        onComplete: () => gib.destroy() 
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }

        // Entire composite puddle layer (core puddle + all gib landing splats) fades cleanly
        currentScene.time.delayedCall(3200, () => {
            if (sharedGoreGfx && sharedGoreGfx.active) {
                currentScene.tweens.add({
                    targets: sharedGoreGfx,
                    alpha: 0,
                    duration: 1000,
                    onComplete: () => sharedGoreGfx.destroy()
                });
            }
        });
    }

    private playClawSwipeFX(targetX: number, targetY: number) {
        const claw = this.scene.add.graphics();
        claw.setPosition(targetX, targetY - 6).setDepth(30000);

        claw.lineStyle(3.5, 0xff1111, 1.0);
        for (let i = -1; i <= 1; i++) {
            const off = i * 9;
            claw.beginPath();
            claw.moveTo(-16 + off, -18);
            claw.lineTo(10 + off, 16);
            claw.strokePath();
        }

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

        for (let b = 0; b < 4; b++) {
            const sprayAng = Phaser.Math.FloatBetween(0.2, 1.2);
            const drop = this.scene.add.ellipse(targetX, targetY, Phaser.Math.Between(4, 7), 2.5, 0x990000, 0.9);
            drop.setRotation(sprayAng).setDepth(25000);

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

    // =========================================================================
    // 🐙 ENLARGED PROCEDURAL NEON KRAKEN RIG (Double Scale, Zero Lag)
    // =========================================================================
    private createBossVisualRig() {
        if (this.isBossRigBuilt || !this.scene) return;
        this.isBossRigBuilt = true;

        // 180px WebGL Native Baked Plasma Aura (Visible, layered, zero-lag)
        if (!this.scene.textures.exists("titan_aura")) {
            const auraGfx = this.scene.make.graphics({ x: 0, y: 0 });
            auraGfx.fillStyle(0xffffff, 0.12);
            auraGfx.fillCircle(90, 90, 88);
            auraGfx.fillStyle(0xffffff, 0.28);
            auraGfx.fillCircle(90, 90, 68);
            auraGfx.fillStyle(0xffffff, 0.55);
            auraGfx.fillCircle(90, 90, 50);
            auraGfx.fillStyle(0xffffff, 0.85);
            auraGfx.fillCircle(90, 90, 32);
            auraGfx.generateTexture("titan_aura", 180, 180);
            auraGfx.destroy();
        }

        // 1. Volumetric Shaded Core (Zero harsh outline circles)
        if (!this.scene.textures.exists("titan_core")) {
            const gfx = this.scene.make.graphics({ x: 0, y: 0 });
            gfx.fillStyle(0x1a0803, 1.0);
            gfx.fillCircle(48, 48, 46);
            gfx.fillStyle(0x36160a, 0.7);
            gfx.fillCircle(48, 44, 42);
            gfx.fillStyle(0x4a2212, 0.5);
            gfx.fillCircle(48, 40, 34);
            gfx.generateTexture("titan_core", 96, 96);
            gfx.destroy();
        }

        // 2. Solid Carved Bark Slab (Beveled, no hollow wireframe lines)
        if (!this.scene.textures.exists("titan_plate")) {
            const gfx = this.scene.make.graphics({ x: 0, y: 0 });
            gfx.fillStyle(0x1f0b04, 1.0);
            gfx.fillRoundedRect(0, 0, 22, 38, 4);
            gfx.fillStyle(0x3d1d0e, 1.0);
            gfx.fillRoundedRect(2, 2, 18, 34, 3);
            gfx.fillStyle(0x5a2d18, 0.85);
            gfx.fillRoundedRect(3, 3, 16, 8, 2);
            gfx.generateTexture("titan_plate", 22, 38);
            gfx.destroy();
        }

        if (!this.scene.textures.exists("titan_node")) {
            const gfx = this.scene.make.graphics({ x: 0, y: 0 });
            gfx.fillStyle(0xffffff, 1.0);
            gfx.fillCircle(14, 14, 14);
            gfx.generateTexture("titan_node", 28, 28);
            gfx.destroy();
        }

        // 3. Sunken Blight Socket with Spreading Root Nerves (Zero stroke lines)
        if (!this.scene.textures.exists("titan_eye_socket")) {
            const gfx = this.scene.make.graphics({ x: 0, y: 0 });
            gfx.fillStyle(0x881111, 0.85);
            gfx.fillTriangle(14, 28, 0, 18, 18, 24);
            gfx.fillTriangle(16, 32, 2, 38, 22, 30);
            gfx.fillTriangle(50, 28, 64, 18, 46, 24);
            gfx.fillTriangle(48, 32, 62, 38, 42, 30);
            gfx.fillTriangle(32, 14, 24, 0, 36, 12);
            gfx.fillTriangle(32, 42, 40, 56, 28, 44);

            gfx.fillStyle(0x140502, 1.0);
            gfx.fillEllipse(32, 28, 48, 28);
            gfx.fillStyle(0x060100, 1.0);
            gfx.fillEllipse(32, 28, 42, 22);
            gfx.generateTexture("titan_eye_socket", 64, 56);
            gfx.destroy();
        }

        // 4. Molten Glowing Eyeball (Layered spherical gradient)
        if (!this.scene.textures.exists("titan_iris")) {
            const gfx = this.scene.make.graphics({ x: 0, y: 0 });
            gfx.fillStyle(0x990000, 1.0);
            gfx.fillCircle(15, 15, 15);
            gfx.fillStyle(0xdd2200, 1.0);
            gfx.fillCircle(15, 15, 12);
            gfx.fillStyle(0xff7700, 1.0);
            gfx.fillCircle(15, 15, 8.5);
            gfx.fillStyle(0xffff44, 1.0);
            gfx.fillCircle(15, 15, 4.5);
            gfx.generateTexture("titan_iris", 30, 30);
            gfx.destroy();
        }

        // 5. 3D Slit Pupil with Glossy Specular Glint
        if (!this.scene.textures.exists("titan_pupil")) {
            const gfx = this.scene.make.graphics({ x: 0, y: 0 });
            gfx.fillStyle(0x0a0101, 1.0);
            gfx.fillEllipse(5, 11, 8, 20);
            gfx.fillStyle(0xffffff, 0.95);
            gfx.fillCircle(6, 7, 2.2);
            gfx.generateTexture("titan_pupil", 10, 22);
            gfx.destroy();
        }

        const startY = this.y - 45;

        // 2. High-Polish Vector Face Rig
        this.bossAura = this.scene.add.image(this.x, startY, "titan_aura")
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(this.y)
            .setTint(0x00ff66)
            .setAlpha(0.35);

        this.bossCore = this.scene.add.image(this.x, startY, "titan_core")
            .setDepth(this.y + 1)
            .setTint(0xff3300);

        // Pure Eldritch Eye Mounted in Core
        this.bossEyeSocket = this.scene.add.image(this.x, startY, "titan_eye_socket")
            .setDepth(this.y + 2);

        this.bossEyeIris = this.scene.add.image(this.x, startY, "titan_iris")
            .setDepth(this.y + 2);

        this.bossEyePupil = this.scene.add.image(this.x, startY, "titan_pupil")
            .setDepth(this.y + 2);

        this.bossArmorPlates = [];
        for (let p = 0; p < 6; p++) {
            const plate = this.scene.add.image(this.x, startY, "titan_plate");
            plate.setDepth(this.y + 2).setTint(0xff6600);
            this.bossArmorPlates.push(plate);
        }

        this.bossTentacles = [];
        const angles = [0.7, 2.4, 3.8, 5.5];
        for (let t = 0; t < 4; t++) {
            const nodes: Phaser.GameObjects.Image[] = [];
            for (let n = 0; n < 10; n++) {
                const node = this.scene.add.image(this.x, startY, "titan_node");
                const size = Phaser.Math.Linear(28, 12, n / 9);
                node.setScale(size / 28);
                if (n === 9) node.setBlendMode(Phaser.BlendModes.ADD);
                node.setDepth(this.y + 1);
                nodes.push(node);
            }
            this.bossTentacles.push({ nodes, baseAngle: angles[t] });
        }
    }

    private updateBossVisualRig(playerX: number, playerY: number, distance: number) {
        if (!this.bossCore || !this.bossAura) {
            this.setAlpha(1.0);
            return;
        }

        const coreX = this.x;
        const coreY = this.y - 45;
        const currentDepth = this.y;

        const heartbeat = 1.0 + Math.sin(this.bossAnimTimer * 2.5) * 0.10;
        this.bossCore.setPosition(coreX, coreY).setScale(heartbeat).setDepth(currentDepth + 1);
        this.bossAura.setPosition(coreX, coreY).setScale(heartbeat * 1.15).setDepth(currentDepth);

        if (this.isEnraged) {
            this.bossCore.setTint(0xffaa00);
            this.bossAura.setTint(0xff4400);
        } else {
            this.bossCore.setTint(0xff3300);
            this.bossAura.setTint(0xff1100);
        }

        // 1. True 2.5D Spherical Eye Tracking & Parallax
        const isAttackingState = this.bossState === "CHARGING" || this.bossState === "SLAM_WINDUP";
        const angleToPlayer = Phaser.Math.Angle.Between(coreX, coreY, playerX, playerY);
        const distRatio = Math.min(1.0, distance / 350);

        // Core breathing
        const coreBob = Math.sin(this.bossAnimTimer * 2.2) * 2.0;

        // Ghost Trail / After-Image Effect during Dashing/Charging
        if (this.bossState === "CHARGING" && this.scene && this.scene.time.now > this.nextGhostTrailTime) {
            this.nextGhostTrailTime = this.scene.time.now + 110;
            this.spawnGhostTrail(coreX, coreY + coreBob, currentDepth);
        }

        // Socket anchors to core
        if (this.bossEyeSocket) {
            this.bossEyeSocket.setPosition(coreX, coreY + coreBob).setDepth(currentDepth + 2);
        }

        // 3D Spherical Eye Displacement (Iris shifts across sphere)
        const maxEyeShift = 8 * distRatio;
        const eyeX = coreX + Math.cos(angleToPlayer) * maxEyeShift;
        const eyeY = coreY + coreBob + Math.sin(angleToPlayer) * (maxEyeShift * 0.65);

        if (this.bossEyeIris) {
            this.bossEyeIris.setPosition(eyeX, eyeY).setDepth(currentDepth + 2);
        }

        if (this.bossEyePupil) {
            // Spherical foreshortening: Pupil contracts horizontally when looking sideways
            const lookHorizontalFactor = Math.abs(Math.cos(angleToPlayer));
            const foreshortenX = Phaser.Math.Linear(1.0, 0.45, lookHorizontalFactor);
            const attackSlit = isAttackingState ? 0.45 : 1.0;

            this.bossEyePupil.setPosition(eyeX + Math.cos(angleToPlayer) * 3, eyeY + Math.sin(angleToPlayer) * 2)
                .setScale(foreshortenX * attackSlit, isAttackingState ? 1.25 : 1.0)
                .setDepth(currentDepth + 2);
        }

        const isArmored = (!this.isEnraged && !this.isArmorCrackedPhase1) || (this.isEnraged && !this.isArmorCrackedPhase2);
        for (let p = 0; p < 6; p++) {
            const plate = this.bossArmorPlates[p];
            if (!plate) continue;

            if (!isArmored) {
                plate.setVisible(false);
                continue;
            }
            plate.setVisible(true);

            const orbitAngle = this.bossAnimTimer * 1.6 + (p * (Math.PI * 2 / 6));
            const ox = coreX + Math.cos(orbitAngle) * 68;
            const oy = coreY + Math.sin(orbitAngle) * 28;
            const depthFactor = Math.sin(orbitAngle); // -1 (back) to +1 (front)

            // True 3D Perspective: Scale with depth (slightly chunkier and more imposing)
            const perspectiveScale = Phaser.Math.Linear(0.95, 1.35, (depthFactor + 1) / 2);
            const foreshortening = Math.max(0.55, Math.abs(Math.sin(orbitAngle + Math.PI / 2)));
            plate.setPosition(ox, oy);
            plate.setScale(foreshortening * perspectiveScale, perspectiveScale);
            plate.setRotation(Math.cos(orbitAngle) * 0.25); // Dynamic 3D tilt along orbit
            plate.setDepth(depthFactor > 0 ? currentDepth + 3 : currentDepth - 1);

            // High-Contrast Specular Lighting
            if (depthFactor > 0) {
                plate.setTint(this.isEnraged ? 0xffaa00 : 0xff7722);
                plate.setAlpha(1.0);
            } else {
                plate.setTint(0x331808); // Deep charred shadow when behind
                plate.setAlpha(0.75);
            }
        }

        for (let t = 0; t < this.bossTentacles.length; t++) {
            const tentacle = this.bossTentacles[t];
            const isFrontTentacle = t === 0 || t === 3;

            for (let n = 0; n < tentacle.nodes.length; n++) {
                const node = tentacle.nodes[n];
                const progress = (n + 1) / tentacle.nodes.length;

                let targetAngle = tentacle.baseAngle;
                let reach = 42 + progress * 115;
                let undulation = Math.sin(this.bossAnimTimer * 2.8 + (n * 0.45)) * (16 * progress);

                if (this.bossState === "CHARGING") {
                    const chargeAngle = Math.atan2(this.chargeVector.y, this.chargeVector.x);
                    targetAngle = chargeAngle + Math.PI + (t - 1.5) * 0.32;
                    reach = 42 + progress * 135;
                    undulation = Math.sin(this.bossAnimTimer * 6 + n) * 6;
                } else if (this.bossState === "SLAM_WINDUP") {
                    targetAngle = -Math.PI / 2 + (t - 1.5) * 0.38;
                    reach = 42 + progress * 125;
                    undulation = Math.sin(this.bossAnimTimer * 7 + n) * 5;
                } else if (distance <= 85 && isFrontTentacle) {
                    const angleToPlayer = Phaser.Math.Angle.Between(coreX, coreY, playerX, playerY);
                    targetAngle = angleToPlayer + (t === 0 ? 0.22 : -0.22);
                    reach = 42 + progress * 130;
                    undulation = Math.sin(this.bossAnimTimer * 5 + n) * 9;
                }

                const perp = targetAngle + Math.PI / 2;
                const nx = coreX + Math.cos(targetAngle) * reach + Math.cos(perp) * undulation;
                const ny = coreY + Math.sin(targetAngle) * reach + Math.sin(perp) * undulation;

                node.setPosition(nx, ny).setDepth(currentDepth - 2);

                const pulse = Math.sin(this.bossAnimTimer * 3.5 - (n * 0.55));
                if (n === 9) {
                    node.setTint(0x00ff66);
                } else if (pulse > 0.35) {
                    node.setTint(0x33ff66);
                } else {
                    node.setTint(n > 6 ? 0x118833 : (n > 3 ? 0x2e6b22 : 0x5a2d18));
                }
            }
        }
    }
}