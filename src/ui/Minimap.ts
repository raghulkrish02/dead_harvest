import Phaser from "phaser";
import Zombie from "../enemies/Zombie";

export default class Minimap {
    private scene: Phaser.Scene;
    private mapSize: number = 120;
    private worldSize: number = 3072;
    private scaleFactor: number;

    private bgBox!: Phaser.GameObjects.Rectangle;
    private borderBox!: Phaser.GameObjects.Rectangle;
    private radarGraphics!: Phaser.GameObjects.Graphics;

    private posX: number;
    private posY: number = 16;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.scaleFactor = this.mapSize / this.worldSize; // 120 / 3072

        // 📐 Adjusted Zoom Coordinates (Aligns with Top HUD)
        const zoom = scene.cameras.main.zoom || 1.25;
        const visibleScreenWidth = scene.scale.width / zoom;

        // Shifted down to y = 80 and padded cleanly from the right edge
        this.posX = visibleScreenWidth - this.mapSize +120;
        this.posY = 80; // Moved down so the entire box is visible!
        // 1. Static Dark Forest Background
        this.bgBox = scene.add.rectangle(
            this.posX + this.mapSize / 2,
            this.posY + this.mapSize / 2,
            this.mapSize,
            this.mapSize,
            0x102010,
            0.85
        ).setScrollFactor(0).setDepth(20000);

        // 2. High-Contrast Border
        this.borderBox = scene.add.rectangle(
            this.posX + this.mapSize / 2,
            this.posY + this.mapSize / 2,
            this.mapSize + 2,
            this.mapSize + 2
        ).setStrokeStyle(2, 0x55aa55).setScrollFactor(0).setDepth(20001);

        // 3. Fast Blip Renderer
        this.radarGraphics = scene.add.graphics().setScrollFactor(0).setDepth(20002);
    }

    public update(playerX: number, playerY: number, activeZombies: Zombie[], biomassOrbs: Phaser.GameObjects.GameObject[] = []) {
        this.radarGraphics.clear();

        // A. Draw Central Farm Clearing Indicator
        const farmMiniX = this.posX + (1600 * this.scaleFactor);
        const farmMiniY = this.posY + (1600 * this.scaleFactor);
        this.radarGraphics.fillStyle(0x335533, 0.6);
        this.radarGraphics.fillRect(farmMiniX - 8, farmMiniY - 8, 16, 16);

        // 🟢 B. Draw Dropped Biomass Orbs (Small Neon Green Dots)
        this.radarGraphics.fillStyle(0x55ff55, 0.95);
        biomassOrbs.forEach((orb) => {
            const sprite = orb as any;
            if (sprite && sprite.active) {
                const miniOrbX = this.posX + (sprite.x * this.scaleFactor);
                const miniOrbY = this.posY + (sprite.y * this.scaleFactor);
                this.radarGraphics.fillCircle(miniOrbX, miniOrbY, 2);
            }
        });

        // 🔴 C. Draw Zombie Blips
        activeZombies.forEach((zombie) => {
            if (!zombie.active) return;

            const miniZombX = this.posX + (zombie.x * this.scaleFactor);
            const miniZombY = this.posY + (zombie.y * this.scaleFactor);

            if (zombie.zombieType === "TITAN") {
                // 👑 Boss: Pulsing Crimson Crown Blip
                this.radarGraphics.fillStyle(0xff0000, 1.0);
                this.radarGraphics.fillCircle(miniZombX, miniZombY, 4.5);
                this.radarGraphics.lineStyle(1.5, 0xffff00, 1.0);
                this.radarGraphics.strokeCircle(miniZombX, miniZombY, 4.5);
            } else if (zombie.zombieType === "BRUTE") {
                // Brute: Orange Blip
                this.radarGraphics.fillStyle(0xff7700, 1.0);
                this.radarGraphics.fillCircle(miniZombX, miniZombY, 3);
            } else {
                // Walker / Runner: Small Red Dot
                this.radarGraphics.fillStyle(0xff2222, 0.9);
                this.radarGraphics.fillCircle(miniZombX, miniZombY, 2);
            }
        });

        // 🔵 D. Draw Player Blip (Bright Blue Dot)
        const miniPlayerX = this.posX + (playerX * this.scaleFactor);
        const miniPlayerY = this.posY + (playerY * this.scaleFactor);

        this.radarGraphics.fillStyle(0x00ccff, 1.0);
        this.radarGraphics.fillCircle(miniPlayerX, miniPlayerY, 3);
        this.radarGraphics.lineStyle(1, 0xffffff, 1.0);
        this.radarGraphics.strokeCircle(miniPlayerX, miniPlayerY, 3);
    }

    public destroy() {
        this.bgBox.destroy();
        this.borderBox.destroy();
        this.radarGraphics.destroy();
    }
}