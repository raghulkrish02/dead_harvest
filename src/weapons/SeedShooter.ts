import Phaser from "phaser";
import Backpack from "../systems/Backpack";
import SeedProjectile from "./SeedProjectile";

export default class SeedShooter {
    private scene: Phaser.Scene;
    private attackCooldown: number = 220;
    private lastAttackTime: number = 0;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    public shoot(playerX: number, chestY: number, pointer: Phaser.Input.Pointer, backpack: Backpack): SeedProjectile | null {
        const currentTime = this.scene.time.now;
        if (currentTime - this.lastAttackTime < this.attackCooldown) return null;

        if (backpack.pepperAmmo <= 0) {
            this.showCustomAmmoText(playerX, chestY, "No Pepper Ammo!");
            return null;
        }

        backpack.addPepperAmmo(-1);
        this.lastAttackTime = currentTime;

        // Gun barrel forward offset (26px forward)
        const angle = Phaser.Math.Angle.Between(playerX, chestY, pointer.worldX, pointer.worldY);
        const spawnX = playerX + Math.cos(angle) * 26;
        const spawnY = chestY + Math.sin(angle) * 26;

        const projectile = new SeedProjectile(this.scene, spawnX, spawnY, pointer.worldX, pointer.worldY, false);
        this.scene.cameras.main.shake(40, 0.0015);
        return projectile;
    }

    public shootPhoenix(playerX: number, chestY: number, pointer: Phaser.Input.Pointer, backpack: Backpack): SeedProjectile | null {
        if (backpack.pepperAmmo < 3) {
            this.showCustomAmmoText(playerX, chestY, "Need 3 Pepper Ammo for Phoenix!");
            return null;
        }

        backpack.addPepperAmmo(-3);
        this.lastAttackTime = this.scene.time.now;

        const angle = Phaser.Math.Angle.Between(playerX, chestY, pointer.worldX, pointer.worldY);
        const spawnX = playerX + Math.cos(angle) * 28;
        const spawnY = chestY + Math.sin(angle) * 28;

        const projectile = new SeedProjectile(this.scene, spawnX, spawnY, pointer.worldX, pointer.worldY, true);
        this.scene.cameras.main.shake(80, 0.004);
        return projectile;
    }

    private showCustomAmmoText(x: number, y: number, msg: string) {
        const text = this.scene.add.text(x, y - 90, msg, {
            fontFamily: "Arial",
            fontSize: "12px",
            color: "#ffaa00",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(20000);

        this.scene.tweens.add({
            targets: text,
            y: text.y - 20,
            alpha: 0,
            duration: 1200,
            onComplete: () => text.destroy()
        });
    }
}