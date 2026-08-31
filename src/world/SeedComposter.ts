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

    public signalUnlockReady() {
        if (this.isUnlocked) return;
        this.setVisible(true);
        this.setAlpha(1.0);
        this.setTint(0xffcc00); // Static yellow highlight — ZERO TWEENS, ZERO JUMPING
    }

    public unlockComposter(): boolean {
        this.isUnlocked = true;
        this.setVisible(true);
        this.setAlpha(1.0);
        this.setTint(0x55aa33);
        this.setDisplaySize(36, 36);
        return true;
    }

    public showPrompt(seeds: number, isWaveActive: boolean) {
        if (isWaveActive) {
            this.promptText.setText("Composting Locked During Wave!");
            this.promptText.setColor("#ff3333");
            return;
        }

        if (!this.isUnlocked) {
            this.promptText.setText("Press [E] to Activate Seed Composter!");
            this.promptText.setColor("#55ff55");
            return;
        }

        if (seeds > 5) {
            this.promptText.setText("Press [E] Compost 4 Seeds (+1 Biomass)");
            this.promptText.setColor("#55ff55");
        } else {
            this.promptText.setText(`Need >5 Seeds to Compost (Have: ${seeds})`);
            this.promptText.setColor("#ffaa00");
        }
    }

    public hidePrompt() {
        this.promptText.setText("");
    }

    public compost(backpack: Backpack): boolean {
        if (!this.isUnlocked || backpack.pepperSeeds <= 5) return false;

        backpack.addPepperSeeds(-4);
        backpack.addBiomass(1);
        return true;
    }
}