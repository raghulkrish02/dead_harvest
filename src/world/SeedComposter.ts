import Phaser from "phaser";
import Backpack from "../systems/Backpack";

export default class SeedComposter extends Phaser.GameObjects.Sprite {
    public isUnlocked: boolean = false;
    private promptText: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y, "stump");

        scene.add.existing(this);

        this.setOrigin(0.5, 0.5);
        this.setDisplaySize(36, 36);
        this.setDepth(y);
        this.setTint(0x55aa33);
        this.setVisible(false);

        this.promptText = scene.add.text(x, y - 28, "", {
            fontFamily: "Arial",
            fontSize: "11px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(20000);
    }

    public unlockComposter() {
        this.isUnlocked = true;
        this.setVisible(true);
        this.setTint(0x88ff44);
    }

    public signalUnlockReady() {
        if (this.isUnlocked) return;
        this.setVisible(true);
        this.setAlpha(1.0);
        this.setTint(0xffcc00);
    }

    public showPrompt(seedsCount: number, isWaveActive: boolean) {
        if (!this.isUnlocked || isWaveActive) {
            this.promptText.setText("");
            return;
        }

        if (seedsCount > 0) {
            this.promptText.setText(`Press [E] Compost Seeds -> Get Pumpkins (-3 Seeds)`);
            this.promptText.setColor("#55ff55");
        } else {
            this.promptText.setText(`Seed Composter | Need Seeds to Compost`);
            this.promptText.setColor("#ffaa00");
        }
    }

    public hidePrompt() {
        this.promptText.setText("");
    }

    public compost(backpack: Backpack, scene: Phaser.Scene): boolean {
        if (!this.isUnlocked || backpack.pepperSeeds < 3) return false;

        backpack.addPepperSeeds(-3);
        backpack.addIronPumpkins(1);

        // 🌟 Composter Green Burst
        const burst = scene.add.circle(this.x, this.y, 12, 0x44ff44, 0.9);
        burst.setDepth(25000);
        scene.tweens.add({
            targets: burst,
            radius: 80,
            alpha: 0,
            duration: 350,
            ease: "Cubic.easeOut",
            onComplete: () => burst.destroy()
        });

        scene.cameras.main.shake(50, 0.002);
        return true;
    }
}
