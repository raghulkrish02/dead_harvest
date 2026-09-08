import Phaser from "phaser";
import Zombie from "../enemies/Zombie";

export default class SeedProjectile extends Phaser.Physics.Arcade.Sprite {
    public damage: number = 15;
    public speed: number = 480;
    public knockbackForce: number = 200;
    public isPhoenix: boolean = false;
    private trailTimer?: Phaser.Time.TimerEvent;

    constructor(scene: Phaser.Scene, x: number, y: number, targetX: number, targetY: number, isPhoenix: boolean = false) {
        super(scene, x, y, "player", 0);

        this.isPhoenix = isPhoenix;

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setActive(true).setVisible(true);

        const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
        this.setRotation(angle + Math.PI / 2);

        this.setDepth(y + 10);

        if (this.isPhoenix) {
            this.damage = 45;
            this.speed = 540;
            this.knockbackForce = 320;
            this.setDisplaySize(28, 22);
            this.setTint(0xffeedd);

            // 🌟 Zero-Lag Object Glow (PreFX) & Additive Blend
            if (this.preFX) {
                this.preFX.addGlow(0xff6600, 3, 0.8, false, 0.1, 10);
            }
            this.setBlendMode(Phaser.BlendModes.ADD);
            this.startPhoenixFlightVFX(angle);
        } else {
            this.damage = 15;
            this.speed = 480;
            this.knockbackForce = 200;
            this.setDisplaySize(12, 12);
            this.setTint(0xff6600);
        }

        // Immediate rock-solid velocity
        const velocityX = Math.cos(angle) * this.speed;
        const velocityY = Math.sin(angle) * this.speed;
        this.setVelocity(velocityX, velocityY);

        // Auto-cleanup after 1.5 seconds if no hit
        scene.time.delayedCall(1500, () => {
            if (this.active) {
                this.cleanup();
            }
        });
    }

    private startPhoenixFlightVFX(flyAngle: number) {
        this.trailTimer = this.scene.time.addEvent({
            delay: 24,
            repeat: 55,
            callback: () => {
                if (!this.active) {
                    this.trailTimer?.remove();
                    return;
                }

                const cos = Math.cos(flyAngle);
                const sin = Math.sin(flyAngle);
                const perpX = Math.cos(flyAngle + Math.PI / 2);
                const perpY = Math.sin(flyAngle + Math.PI / 2);

                // 1. Batch all 4 wing feathers into 1 single tween!
                const feathers: Phaser.GameObjects.Ellipse[] = [];
                [-18, -9, 9, 18].forEach((wingSpan) => {
                    const wingBackSweep = Math.abs(wingSpan) * 0.8;
                    const wx = this.x - cos * wingBackSweep + perpX * wingSpan;
                    const wy = this.y - sin * wingBackSweep + perpY * wingSpan;

                    const feather = this.scene.add.ellipse(wx, wy, Math.abs(wingSpan) > 10 ? 12 : 8, 4, 0xff7700, 0.95);
                    feather.setRotation(flyAngle + (wingSpan > 0 ? 0.35 : -0.35))
                           .setBlendMode(Phaser.BlendModes.ADD)
                           .setDepth(25000);
                    feather.setData("tx", wx - cos * 22);
                    feather.setData("ty", wy - sin * 22);
                    feathers.push(feather);
                });

                this.scene.tweens.add({
                    targets: feathers,
                    x: (t: any) => t.getData("tx"),
                    y: (t: any) => t.getData("ty"),
                    scaleX: 0.2,
                    alpha: 0,
                    duration: 180,
                    ease: "Quad.easeOut",
                    onComplete: () => feathers.forEach(f => { if (f && f.active) f.destroy(); })
                });

                // 2. Trailing Embers & Thermal Smoke
                const tailX = this.x - cos * 16 + Phaser.Math.Between(-3, 3);
                const tailY = this.y - sin * 16 + Phaser.Math.Between(-3, 3);

                const ember = this.scene.add.circle(tailX, tailY, Phaser.Math.Between(3, 5), 0xffff88, 1.0);
                ember.setBlendMode(Phaser.BlendModes.ADD).setDepth(25001);
                this.scene.tweens.add({
                    targets: ember,
                    x: tailX - cos * 35,
                    y: tailY - sin * 35,
                    scale: 0.1,
                    alpha: 0,
                    duration: 240,
                    onComplete: () => ember.destroy()
                });

                const smoke = this.scene.add.circle(tailX, tailY, Phaser.Math.Between(5, 9), 0x331a0a, 0.45).setDepth(24998);
                this.scene.tweens.add({
                    targets: smoke,
                    x: tailX - cos * 40,
                    y: tailY - sin * 40 - 10,
                    scale: 1.6,
                    alpha: 0,
                    duration: 450,
                    ease: "Cubic.easeOut",
                    onComplete: () => smoke.destroy()
                });
            }
        });
    }

    public onHitZombie(zombie: Zombie) {
        if (!this.active || !zombie.active) return;

        if (this.isPhoenix) {
            // 1. GUARANTEE direct damage to the target struck before AoE
            const knockDir = new Phaser.Math.Vector2(zombie.x - this.x, zombie.y - this.y).normalize();
            zombie.takeDamage(this.damage, knockDir, 280, "RANGED");
            this.explodePhoenixAoE(zombie);
        } else {
            const zombieChestY = zombie.y - (zombie.displayHeight / 2);
            const knockbackDir = new Phaser.Math.Vector2(
                zombie.x - this.x,
                zombieChestY - this.y
            ).normalize();

            const mainScene = this.scene as any;
            if (mainScene.triggerHitStop) mainScene.triggerHitStop(0);

            if (mainScene.triggerSmartShake) {
                mainScene.triggerSmartShake("LIGHT");
            } else {
                this.scene.cameras.main.shake(40, 0.0015);
            }
            zombie.takeDamage(this.damage, knockbackDir, this.knockbackForce, "RANGED");
            this.spawnFireBurst();
            this.cleanup();
        }
    }

    public onHitObstacle(_obstacleType: "TREE" | "ROCK") {
        if (!this.active) return;

        const mainScene = this.scene as any;
        if (mainScene.trapManager) {
            const trap = mainScene.trapManager.getTrapAtWorldPos(this.x, this.y);
            if (trap && trap.type === "BARREL" && mainScene.waveManager) {
                mainScene.trapManager.detonateBarrel(trap, mainScene.waveManager.getActiveZombies());
                this.cleanup();
                return;
            }
        }

        if (this.isPhoenix) this.explodePhoenixAoE(undefined);
        else {
            this.spawnFireBurst();
            this.cleanup();
        }
    }

    private explodePhoenixAoE(directTarget?: Zombie) {
        const aoeRadius = 105;
        const mainScene = this.scene as any;

        // Kill trail timer immediately so flight particles stop generating
        this.trailTimer?.remove();

        // 🚀 Zero-Freeze AOE: Keeps game moving at full 60 FPS without the 5-frame hitch!
        if (mainScene.triggerHitStop) mainScene.triggerHitStop(0);
        if (mainScene.triggerSmartShake) {
            mainScene.triggerSmartShake("HEAVY");
        } else {
            this.scene.cameras.main.shake(160, 0.012);
        }

        // 💥 PHASE 1: Dual Additive Shockwaves
        const outerRing = this.scene.add.circle(this.x, this.y, 12, 0xff3300, 0.9);
        outerRing.setStrokeStyle(6, 0xffff66).setBlendMode(Phaser.BlendModes.ADD).setDepth(25002);
        this.scene.tweens.add({
            targets: outerRing,
            radius: aoeRadius,
            alpha: 0,
            duration: 340,
            ease: "Expo.easeOut",
            onComplete: () => outerRing.destroy()
        });

        const flashCore = this.scene.add.circle(this.x, this.y, 18, 0xffffff, 1.0);
        flashCore.setBlendMode(Phaser.BlendModes.ADD).setDepth(25003);
        this.scene.tweens.add({
            targets: flashCore,
            radius: 65,
            alpha: 0,
            duration: 200,
            ease: "Quad.easeOut",
            onComplete: () => flashCore.destroy()
        });

        // 💨 PHASE 2: 14 Billowing Smoke Clouds (Batched into 1 Single Tween!)
        const smokeClouds: Phaser.GameObjects.Arc[] = [];
        for (let s = 0; s < 14; s++) {
            const smokeAng = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const smokeDist = Phaser.Math.Between(20, aoeRadius * 0.75);
            const targetX = this.x + Math.cos(smokeAng) * smokeDist;
            const targetY = this.y + Math.sin(smokeAng) * smokeDist - Phaser.Math.Between(10, 25);

            const smokeColor = s % 2 === 0 ? 0x221815 : 0x3d2314;
            const smokeCloud = this.scene.add.circle(this.x, this.y, Phaser.Math.Between(14, 22), smokeColor, 0.75);
            smokeCloud.setDepth(24999);
            smokeCloud.setData("tx", targetX);
            smokeCloud.setData("ty", targetY);
            smokeCloud.setData("tScale", Phaser.Math.FloatBetween(1.8, 2.6));
            smokeClouds.push(smokeCloud);
        }

        this.scene.tweens.add({
            targets: smokeClouds,
            x: (t: any) => t.getData("tx"),
            y: (t: any) => t.getData("ty"),
            scale: (t: any) => t.getData("tScale"),
            alpha: 0,
            duration: 1300,
            ease: "Cubic.easeOut",
            onComplete: () => smokeClouds.forEach(sc => { if (sc && sc.active) sc.destroy(); })
        });

        // 🔥 PHASE 3: 18 Rising Volcanic Ash Embers (Batched into 1 Single Tween!)
        const ashEmbers: Phaser.GameObjects.Arc[] = [];
        for (let e = 0; e < 18; e++) {
            const emberAng = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const spreadX = this.x + Math.cos(emberAng) * Phaser.Math.Between(15, 65);
            const spreadY = this.y + Math.sin(emberAng) * Phaser.Math.Between(15, 45);

            const ashEmber = this.scene.add.circle(spreadX, spreadY, Phaser.Math.Between(2, 4), 0xffaa00, 0.95);
            ashEmber.setBlendMode(Phaser.BlendModes.ADD).setDepth(25001);
            ashEmber.setData("tx", spreadX + Phaser.Math.Between(-20, 20));
            ashEmber.setData("ty", spreadY - Phaser.Math.Between(35, 75));
            ashEmbers.push(ashEmber);
        }

        this.scene.tweens.add({
            targets: ashEmbers,
            x: (t: any) => t.getData("tx"),
            y: (t: any) => t.getData("ty"),
            scale: 0.1,
            alpha: 0,
            duration: 1400,
            ease: "Quad.easeOut",
            onComplete: () => ashEmbers.forEach(ae => { if (ae && ae.active) ae.destroy(); })
        });

        // 🩸 PHASE 4: Charred Ground Decal
        const scorch = this.scene.add.circle(this.x, this.y, 42, 0x240d05, 0.85).setDepth(2);
        this.scene.tweens.add({
            targets: scorch,
            scale: 1.3,
            alpha: 0,
            duration: 1800,
            ease: "Quad.easeOut",
            onComplete: () => scorch.destroy()
        });

        // Damage & Knockback to Zombies
        if (mainScene.waveManager) {
            const activeZombies = mainScene.waveManager.getActiveZombies();
            activeZombies.forEach((z: Zombie) => {
                if (z === directTarget) return; // Already took direct hit damage

                // Center target offset: Titan core is at y - 45, regular zombies at half displayHeight
                const targetY = (z as any).isBoss ? (z.y - 45) : (z.y - (z.displayHeight / 2));
                const dist = Phaser.Math.Distance.Between(this.x, this.y, z.x, targetY);

                if (dist <= aoeRadius) {
                    const knockDir = new Phaser.Math.Vector2(z.x - this.x, z.y - this.y).normalize();
                    z.takeDamage(this.damage, knockDir, 300, "RANGED");
                }
            });
        }

        this.cleanup();
    }

    private spawnFireBurst() {
        for (let i = 0; i < 6; i++) {
            const spark = this.scene.add.circle(this.x, this.y, Phaser.Math.Between(2, 4), 0xffaa00);
            spark.setDepth(20000);
            const angle = Phaser.Math.DegToRad(Phaser.Math.Between(0, 360));
            const speed = Phaser.Math.Between(60, 150);

            this.scene.tweens.add({
                targets: spark,
                x: this.x + Math.cos(angle) * (speed / 3),
                y: this.y + Math.sin(angle) * (speed / 3),
                alpha: 0,
                scale: 0.1,
                duration: Phaser.Math.Between(150, 300),
                onComplete: () => spark.destroy()
            });
        }
    }

    private cleanup() {
        this.trailTimer?.remove();
        this.destroy();
    }
}
