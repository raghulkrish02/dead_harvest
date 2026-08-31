import Phaser from "phaser";

export enum HerbState {
    EMPTY = "EMPTY",
    PLANTED = "PLANTED",
    GROWING = "GROWING",
    MATURE = "MATURE"
}

export default class HerbPlot extends Phaser.GameObjects.Sprite {
    public state: HerbState = HerbState.EMPTY;
    public isUnlocked: boolean = true;
    private growthTimer: number = 0;
    private growthDuration: number = 4000;
    private promptText: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, x: number, y: number, isUnlocked: boolean = true) {
        super(scene, x, y, "plowed_dirt");

        scene.add.existing(this);

        this.setOrigin(0.5, 0.5);
        this.setDisplaySize(32, 32);
        this.setDepth(1);
        this.isUnlocked = isUnlocked;

        if (!this.isUnlocked) {
            this.setTint(0x443322); // Dark weed tint
        } else {
            this.setTint(0x33aa55); // Green herb plot tint
        }

        this.promptText = scene.add.text(x, y - 22, "", {
            fontFamily: "Arial",
            fontSize: "11px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(20000);
    }

    public updateHerbPlot(delta: number) {
        if (!this.isUnlocked) return;

        if (this.state === HerbState.PLANTED || this.state === HerbState.GROWING) {
            this.growthTimer += delta;

            if (this.state === HerbState.PLANTED && this.growthTimer >= this.growthDuration / 2) {
                this.state = HerbState.GROWING;
                this.setTint(0x66ff88); // Light green sprout
            }

            if (this.state === HerbState.GROWING && this.growthTimer >= this.growthDuration) {
                this.state = HerbState.MATURE;
                this.setTint(0x00ff66); // Glowing green mature herb
            }
        }
    }

    public showPrompt(pepperSeeds: number, isWaveActive: boolean) {
        if (isWaveActive) {
            this.promptText.setText("Farming Locked During Wave!");
            this.promptText.setColor("#ff3333");
            return;
        }

        if (!this.isUnlocked) {
            if (pepperSeeds >= 4) {
                this.promptText.setText("Press [E] Unlock Herb Plot (4 Seeds)");
                this.promptText.setColor("#55ff55");
            } else {
                this.promptText.setText("Herb Plot Locked! Need 4 Seeds!");
                this.promptText.setColor("#ff5555");
            }
            return;
        }

        if (this.state === HerbState.EMPTY) {
            if (this.state === HerbState.EMPTY) {
            // 🛡️ STRICT SAFETY BUFFER: Must have strictly MORE THAN 2 seeds!
            if (pepperSeeds > 2) {
                const reserve = pepperSeeds - 2;
                this.promptText.setText(`Press [E] Cultivate Herb (2 Seeds | Reserve: ${reserve})`);
                this.promptText.setColor("#55ff55");
            } else {
                this.promptText.setText(`Need >2 Seeds! (Have: ${pepperSeeds} | Keeping 2 for Pepper Farm)`);
                this.promptText.setColor("#ffaa00");
            }
        }
        } else if (this.state === HerbState.PLANTED || this.state === HerbState.GROWING) {
            this.promptText.setText("Growing Heal Herb... (4s)");
            this.promptText.setColor("#ffff55");
        } else if (this.state === HerbState.MATURE) {
            this.promptText.setText("Press [E] Harvest Heal Herb (+25 HP)!");
            this.promptText.setColor("#00ff66");
        }
    }

    public hidePrompt() {
        this.promptText.setText("");
    }

    public unlockHerbPlot(): boolean {
        this.isUnlocked = true;
        this.setTint(0x33aa55);
        return true;
    }

    public plantHerb(): boolean {
        if (!this.isUnlocked || this.state !== HerbState.EMPTY) return false;
        this.state = HerbState.PLANTED;
        this.growthTimer = 0;
        this.setTint(0x228844);
        return true;
    }

    public harvestHerb(): boolean {
        if (!this.isUnlocked || this.state !== HerbState.MATURE) return false;

        this.state = HerbState.EMPTY;
        this.growthTimer = 0;
        this.setTint(0x33aa55);
        return true; // Returns 1 Heal Herb
    }
}