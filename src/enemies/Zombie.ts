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

    private speed: number = 90;
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

    // 🩸 PERSISTENT BODY WOUND OVERLAYS
    private bodyBloodStains: { shape: Phaser.GameObjects.Ellipse; offsetX: number; offsetY: number }[] = [];

    constructor(scene: Phaser.Scene, x: number, y: number, type: ZombieType = "WALKER") {
        super(scene, x, y, "player", 0);

        this.zombieType = type;

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setCollideWorldBounds(true);
        this.setOrigin(0.5, 1.0);

        this.applyTypeStats();
        this.createHPBar(scene);
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
                this.setScale(2.0);
                this.body?.setSize(10, 5);
                this.body?.setOffset(11, 21);
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
                this.defaultTint = 0x662222;
                this.setScale(3.2);
                this.body?.setSize(18, 6);
                this.body?.setOffset(7, 20);
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
                this.setScale(4.0);
                this.body?.setSize(20, 8);
                this.body?.setOffset(6, 17);
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
                this.defaultTint = 0x55aa55;
                this.setScale(2.5);
                this.body?.setSize(12, 5);
                this.body?.setOffset(9.5, 21);
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
        this.spawnBloodParticles(knockbackDir);
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
            this.destroy();
        }
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
        const biomassOrb = this.scene.add.circle(x, y, 6, 0x55ff55);
        this.scene.physics.add.existing(biomassOrb);
        biomassOrb.setDepth(1);
        const body = biomassOrb.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false);
        biomassOrb.setData("type", "biomass");
        biomassOrb.setData("amount", 1);
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

    private spawnBloodParticles(knockbackDir: Phaser.Math.Vector2) {
        const currentScene = this.scene;
        if (!currentScene || !currentScene.add || !currentScene.tweens) return;

        const count = this.zombieType === "TITAN" ? 35 : (this.zombieType === "BRUTE" ? 24 : 16);
        const bloodColor = this.zombieType === "TITAN" ? 0x4a0000 : (this.zombieType === "BRUTE" ? 0x6b0000 : 0x8a0303);

        const startX = this.x;
        const startY = this.y - (this.displayHeight / 2);

        for (let i = 0; i < count; i++) {
            const spreadAngle = Phaser.Math.DegToRad(Phaser.Math.Between(-25, 25));
            const sprayVec = knockbackDir.clone().rotate(spreadAngle);

            const dropW = Phaser.Math.Between(7, 14);
            const dropH = Phaser.Math.Between(3, 6);
            const droplet = currentScene.add.ellipse(startX, startY, dropW, dropH, bloodColor, 0.95);
            droplet.setRotation(Phaser.Math.Angle.Between(0, 0, sprayVec.x, sprayVec.y));
            droplet.setDepth(25000);

            const travelDist = Phaser.Math.Between(30, 85);
            const targetX = startX + sprayVec.x * travelDist;
            const targetY = startY + sprayVec.y * travelDist + Phaser.Math.Between(8, 20);

            currentScene.tweens.add({
                targets: droplet,
                x: targetX,
                y: targetY,
                duration: Phaser.Math.Between(150, 250),
                ease: "Cubic.easeOut",
                onComplete: () => droplet.destroy()
            });
        }

        const puddleDist = Phaser.Math.Between(25, 65);
        const puddleX = startX + knockbackDir.x * puddleDist;
        const puddleY = startY + knockbackDir.y * puddleDist + 12;

        const puddleGfx = currentScene.add.graphics();
        puddleGfx.setDepth(2);
        puddleGfx.fillStyle(bloodColor, 0.88);

        const baseRadius = this.zombieType === "TITAN" ? 18 : (this.zombieType === "BRUTE" ? 14 : 10);
        puddleGfx.fillCircle(0, 0, baseRadius);
        puddleGfx.fillCircle(baseRadius * 0.4, baseRadius * 0.2, baseRadius * 0.7);
        puddleGfx.fillCircle(-baseRadius * 0.3, -baseRadius * 0.2, baseRadius * 0.6);
        puddleGfx.fillCircle(baseRadius * 0.2, -baseRadius * 0.4, baseRadius * 0.65);

        const angle = Phaser.Math.Angle.Between(0, 0, knockbackDir.x, knockbackDir.y);
        for (let d = 0; d < 3; d++) {
            const dripAngle = angle + Phaser.Math.FloatBetween(-0.35, 0.35);
            const dripLen = baseRadius * Phaser.Math.FloatBetween(1.6, 2.8);
            puddleGfx.fillCircle(Math.cos(dripAngle) * dripLen, Math.sin(dripAngle) * dripLen, baseRadius * 0.35);
        }

        puddleGfx.setPosition(puddleX, puddleY);
        puddleGfx.setScale(0.3);

        currentScene.tweens.add({
            targets: puddleGfx,
            scaleX: 1.0,
            scaleY: 0.75,
            duration: 140,
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

    public attackFence(fence: IFenceData, fenceManager: FenceManager, playerX: number, playerY: number) {
        if (this.zombieType === "TITAN" || this.zombieType === "BRUTE") {
            this.executeFenceAttack(fence, fenceManager);
            return;
        }

        const moveDir = new Phaser.Math.Vector2(playerX - this.x, playerY - this.y).normalize();
        const gap = fenceManager.findNearbyOpening(fence.gridX, fence.gridY, moveDir);

        if (gap) {
            const angleToGap = Phaser.Math.Angle.Between(this.x, this.y, gap.x, gap.y);
            this.setVelocity(Math.cos(angleToGap) * this.speed, Math.sin(angleToGap) * this.speed);
            this.handleDirectionalAnimation(angleToGap);
            return;
        }

        this.executeFenceAttack(fence, fenceManager);
    }

    private executeFenceAttack(fence: IFenceData, fenceManager: FenceManager) {
        const currentTime = this.scene.time.now;
        if (currentTime > this.fenceAttackTimer) {
            fenceManager.damageFence(fence.gridX, fence.gridY, this.fenceHitDamage);
            this.fenceAttackTimer = currentTime + this.fenceAttackCooldown;

            this.scene.tweens.add({
                targets: this,
                scaleX: this.scaleX * 1.1,
                scaleY: this.scaleY * 0.9,
                duration: 80,
                yoyo: true
            });
        }
    }

    private handleDirectionalAnimation(angle: number) {
        if (!this.anims || !this.scene || !this.scene.anims) return;

        const deg = Phaser.Math.RadToDeg(angle);

        if (this.zombieType === "RUNNER") this.anims.timeScale = 1.6;
        else if (this.zombieType === "BRUTE") this.anims.timeScale = 0.75;
        else if (this.zombieType === "TITAN") this.anims.timeScale = this.bossState === "CHARGING" ? 2.2 : 0.85;
        else this.anims.timeScale = 1.0;

        const hasWalkRight = this.scene.anims.exists("walk-right");
        const hasWalkDown = this.scene.anims.exists("walk-down");
        const hasWalkUp = this.scene.anims.exists("walk-up");

        if (deg >= -45 && deg <= 45) {
            this.setFlipX(false);
            if (hasWalkRight) this.anims.play("walk-right", true);
        } else if (deg >= 135 || deg <= -135) {
            this.setFlipX(true);
            if (hasWalkRight) this.anims.play("walk-right", true);
        } else if (deg > 45 && deg < 135) {
            if (hasWalkDown) this.anims.play("walk-down", true);
        } else {
            if (hasWalkUp) this.anims.play("walk-up", true);
        }
    }

    public update(playerX: number, playerY: number) {
        if (!this.active) return;
        this.updateHPBar();
        this.updateBloodStains();
        if (this.isKnockedBack) return;

        const distance = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);

        if (this.zombieType === "TITAN") {
            this.updateTitanBossAI(playerX, playerY, distance);
            return;
        }

        const attackRange = this.zombieType === "BRUTE" ? 55 : 42;
        if (distance <= attackRange) {
            this.setVelocity(0, 0);
            if (this.scene?.anims?.exists("idle-down")) {
                this.anims?.play("idle-down", true);
            }

            const currentTime = this.scene.time.now;
            if (currentTime > this.playerDamageTimer) {
                const mainScene = this.scene as any;
                if (mainScene.player && mainScene.player.takeDamage) {
                    mainScene.player.takeDamage(this.playerChewDamage);
                }
                this.playerDamageTimer = currentTime + this.playerAttackCooldown;
            }
            return;
        }

        const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
        this.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
        this.handleDirectionalAnimation(angle);
    }

    private updateTitanBossAI(playerX: number, playerY: number, distance: number) {
        const currentTime = this.scene.time.now;
        const mainScene = this.scene as any;

        if (this.bossState === "CHARGING") {
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

        if (this.bossState === "CHASE" && distance <= 90 && currentTime > this.nextBossSpecialTime) {
            this.bossState = "SLAM_WINDUP";
            this.setVelocity(0, 0);
            if (this.scene?.anims?.exists("idle-down")) {
                this.anims?.play("idle-down", true);
            }
            this.nextBossSpecialTime = currentTime + 4500;

            this.slamWarningCircle = this.scene.add.circle(this.x, this.y - 45, 10, 0xff0000, 0.4);
            this.slamWarningCircle.setStrokeStyle(3, 0xff3333).setDepth(15000);

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
        slamRing.setStrokeStyle(4, 0xff5500).setDepth(15000);
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
}