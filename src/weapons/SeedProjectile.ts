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

        if (this.isPhoenix) {
            this.damage = 45;
            this.speed = 520;
            this.knockbackForce = 300;
            this.setDisplaySize(24, 24);
            this.setTint(0xff3300);
            this.startPhoenixTrail();
        } else {
            this.damage = 15;
            this.speed = 480;
            this.knockbackForce = 200;
            this.setDisplaySize(12, 12);
            this.setTint(0xff6600);
        }

        this.setDepth(y + 10);

        const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
        this.setRotation(angle + Math.PI / 2);

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

    private startPhoenixTrail() {
        this.trailTimer = this.scene.time.addEvent({
            delay: 35,
            repeat: 35,
            callback: () => {
                if (!this.active) {
                    this.trailTimer?.remove();
                    return;
                }
                const spark = this.scene.add.circle(
                    this.x + Phaser.Math.Between(-4, 4),
                    this.y + Phaser.Math.Between(-4, 4),
                    Phaser.Math.Between(4, 7),
                    Phaser.Math.RND.pick([0xff2200, 0xff7700, 0xffff00])
                ).setDepth(24000);

                this.scene.tweens.add({
                    targets: spark,
                    alpha: 0,
                    scale: 0.2,
                    duration: 180,
                    onComplete: () => spark.destroy()
                });
            }
        });
    }

    public onHitZombie(zombie: Zombie) {
        if (!this.active || !zombie.active) return;

        if (this.isPhoenix) {
            this.explodePhoenixAoE();
        } else {
            const zombieChestY = zombie.y - (zombie.displayHeight / 2);
            const knockbackDir = new Phaser.Math.Vector2(
                zombie.x - this.x,
                zombieChestY - this.y
            ).normalize();

            const mainScene = this.scene as any;
            if (mainScene.triggerHitStop) mainScene.triggerHitStop(40);

            this.scene.cameras.main.shake(60, 0.003);
            zombie.takeDamage(this.damage, knockbackDir, this.knockbackForce, "RANGED");
            this.spawnFireBurst();
            this.cleanup();
        }
    }

    public onHitObstacle(obstacleType: "TREE" | "ROCK") {
        if (!this.active) return;

        if (this.isPhoenix) {
            this.explodePhoenixAoE();
        } else {
            this.spawnFireBurst();
            this.cleanup();
        }
    }

    private explodePhoenixAoE() {
        const aoeRadius = 90;
        const mainScene = this.scene as any;

        if (mainScene.triggerHitStop) mainScene.triggerHitStop(60);
        this.scene.cameras.main.shake(120, 0.008);

        const blastRing = this.scene.add.circle(this.x, this.y, 12, 0xff3300, 0.7);
        blastRing.setStrokeStyle(4, 0xffff00).setDepth(25000);
        this.scene.tweens.add({
            targets: blastRing,
            radius: aoeRadius,
            alpha: 0,
            duration: 350,
            ease: "Quad.easeOut",
            onComplete: () => blastRing.destroy()
        });

        for (let i = 0; i < 16; i++) {
            const spark = this.scene.add.circle(
                this.x, 
                this.y, 
                Phaser.Math.Between(4, 7), 
                Phaser.Math.RND.pick([0xff2200, 0xff7700, 0xffff00])
            );
            spark.setDepth(25000);
            const angle = Phaser.Math.DegToRad(Phaser.Math.Between(0, 360));
            const dist = Phaser.Math.Between(30, aoeRadius);

            this.scene.tweens.add({
                targets: spark,
                x: this.x + Math.cos(angle) * dist,
                y: this.y + Math.sin(angle) * dist,
                alpha: 0,
                scale: 0.1,
                duration: Phaser.Math.Between(250, 450),
                onComplete: () => spark.destroy()
            });
        }

        if (mainScene.waveManager) {
            const activeZombies: Zombie[] = mainScene.waveManager.getActiveZombies();
            activeZombies.forEach((z) => {
                const dist = Phaser.Math.Distance.Between(this.x, this.y, z.x, z.y - (z.displayHeight / 2));
                if (dist <= aoeRadius) {
                    const knockDir = new Phaser.Math.Vector2(z.x - this.x, z.y - this.y).normalize();
                    z.takeDamage(this.damage, knockDir, this.knockbackForce, "RANGED");
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