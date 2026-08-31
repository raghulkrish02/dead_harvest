import Phaser from "phaser";
import Backpack from "../systems/Backpack";

export default class CraftingBench extends Phaser.GameObjects.Sprite {
    private promptText: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y, "stump");

        scene.add.existing(this);

        this.setOrigin(0.5, 0.5);
        this.setDisplaySize(36, 36);
        this.setDepth(y);
        this.setTint(0xcc8833); // Wood Crafting Table Bronze Tint

        this.promptText = scene.add.text(x, y - 25, "", {
            fontFamily: "Arial",
            fontSize: "11px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(20000);
    }

    public showPrompt(biomassCount: number, isWaveActive: boolean) {
        if (isWaveActive) {
            this.promptText.setText("Crafting Locked During Wave!");
            this.promptText.setColor("#ff3333");
            return;
        }

        if (biomassCount >= 1) {
            this.promptText.setText("Press [E] Craft Fence (1 Biomass)");
            this.promptText.setColor("#55ff55");
        } else {
            this.promptText.setText("Need 1 Biomass to Craft Fence!");
            this.promptText.setColor("#ff5555");
        }
    }       

    public hidePrompt() {
        this.promptText.setText("");
    }

    public craftFence(backpack: Backpack): boolean {
        if (backpack.biomassCount < 1) return false;

        backpack.addBiomass(-1); // Only costs 1 Biomass!
        backpack.addFences(1);
        return true;
    }
}