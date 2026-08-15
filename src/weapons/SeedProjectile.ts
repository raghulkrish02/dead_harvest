import Phaser from "phaser";
import Zombie from "../enemies/Zombie";

export default class SeedProjectile extends Phaser.Physics.Arcade.Sprite {
    private damage: number = 15;
    private speed: number = 450;
    private knockbackForce: number = 180;

    constructor(scene: Phaser.Scene, x: number, y: number, targetX: number, targetY: number) {
        super(scene, x, y, "player", 0);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Visual Bullet styling (Small glowing orange seed)
        this.setDisplaySize(12, 12);
        this.setTint(0xff6600); // Fire Orange
        this.setDepth(y + 10);

        // Calculate Angle & Velocity towards Mouse Pointer
        const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
        this.setRotation(angle);

        const velocityX = Math.cos(angle) * this.speed;
        const velocityY = Math.sin(angle) * this.speed;
        this.setVelocity(velocityX, velocityY);

        // Auto-destroy after 1.5 seconds if it misses enemies
        scene.time.delayedCall(1500, () => {
            if (this.active) this.destroy();
        });
    }

    // Inside onHitZombie() in src/weapons/SeedProjectile.ts:
// Inside onHitZombie() in src/weapons/SeedProjectile.ts:
public onHitZombie(zombie: Zombie) {
    if (!this.active || !zombie.active) return;

    const zombieChestY = zombie.y - (zombie.displayHeight / 2);

    const knockbackDir = new Phaser.Math.Vector2(
        zombie.x - this.x,
        zombieChestY - this.y
    ).normalize();

    const mainScene = this.scene as any;
    if (mainScene.triggerHitStop) {
        mainScene.triggerHitStop(40);
    }

    this.scene.cameras.main.shake(60, 0.003);

    // PASSES 'RANGED' AS KILL SOURCE (40% Biomass Drop Rate)
    zombie.takeDamage(this.damage, knockbackDir, this.knockbackForce, "RANGED");

    this.spawnFireBurst();
    this.destroy();
}
    private spawnFireBurst() {
        for (let i = 0; i < 6; i++) {
            const spark = this.scene.add.circle(this.x, this.y, Phaser.Math.Between(2, 4), 0xffaa00);
            spark.setDepth(20000);

            const angle = Phaser.Math.DegToRad(Phaser.Math.Between(0, 360));
            const speed = Phaser.Math.Between(60, 150);

            this.scene.tweens.add({
                targets: spark,
                x: spark.x + Math.cos(angle) * (speed / 3),
                y: spark.y + Math.sin(angle) * (speed / 3),
                alpha: 0,
                scale: 0.1,
                duration: Phaser.Math.Between(150, 300),
                onComplete: () => spark.destroy()
            });
        }
    }
}