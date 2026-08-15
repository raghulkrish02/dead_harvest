import Phaser from "phaser";
import SeedProjectile from "./SeedProjectile";
import Backpack from "../systems/Backpack";

export default class SeedShooter {
    private scene: Phaser.Scene;
    private attackCooldown: number = 250; // Fast 250ms fire rate
    private lastAttackTime: number = 0;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    public shoot(playerX: number, chestY: number, pointer: Phaser.Input.Pointer, backpack: Backpack): SeedProjectile | null {
        const currentTime = this.scene.time.now;
        if (currentTime - this.lastAttackTime < this.attackCooldown) return null;

        // Check if player has Pepper Ammo
        if (backpack.pepperAmmo <= 0) {
            this.showNoAmmoText(playerX, chestY);
            return null;
        }

        // Consume 1 Pepper Ammo
        backpack.addPepperAmmo(-1);
        this.lastAttackTime = currentTime;

        // Get Mouse World Coordinates
        const worldX = pointer.worldX;
        const worldY = pointer.worldY;

        // Spawn Seed Projectile from Chest Height!
        const projectile = new SeedProjectile(this.scene, playerX, chestY, worldX, worldY);

        // Camera recoil shake
        this.scene.cameras.main.shake(40, 0.0015);

        return projectile;
    }

    private showNoAmmoText(x: number, y: number) {
        const text = this.scene.add.text(x, y - 30, "No Pepper Ammo!", {
            fontFamily: "Arial",
            fontSize: "12px",
            color: "#ff3333",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(20000);

        this.scene.tweens.add({
            targets: text,
            y: text.y - 15,
            alpha: 0,
            duration: 600,
            onComplete: () => text.destroy()
        });
    }
}