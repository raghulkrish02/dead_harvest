import Phaser from "phaser";

export enum CropState {
    EMPTY = "EMPTY",
    PLANTED = "PLANTED",
    GROWING = "GROWING",
    MATURE = "MATURE"
}

export default class FarmPlot extends Phaser.GameObjects.Sprite {
    public state: CropState = CropState.EMPTY;
    public cropType: string = "pepper";
    
    // Soil Fertility & Expansion
    public isUnlocked: boolean = true;
    public fertility: number = 100;
    public maxFertility: number = 100;
    public tier: number = 1;

    private growthTimer: number = 0;
    private baseGrowthDuration: number = 4000;
    private promptText: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y, "plowed_dirt");

        scene.add.existing(this);

        this.setOrigin(0.5, 0.5);
        this.setDisplaySize(36, 36);
        this.setDepth(1);

        this.promptText = scene.add.text(x, y - 25, "", {
            fontFamily: "Arial",
            fontSize: "11px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(20000);
    }

    public updatePlot(delta: number) {
        const tierSpeedMultiplier = 1 + (this.tier - 1) * 0.25;
        const lowFertilityPenalty = this.fertility >= 25 ? 1.0 : 0.5;
        const currentGrowthDuration = this.baseGrowthDuration / tierSpeedMultiplier;

        if (this.isUnlocked && (this.state === CropState.PLANTED || this.state === CropState.GROWING)) {
            this.growthTimer += delta * lowFertilityPenalty;

            if (this.state === CropState.PLANTED && this.growthTimer >= currentGrowthDuration / 2) {
                this.state = CropState.GROWING;
                this.setTint(0x55ff55); // Green sprout
            }

            if (this.state === CropState.GROWING && this.growthTimer >= currentGrowthDuration) {
                this.state = CropState.MATURE;
                this.setTint(0xffaa00); // Golden ready crop
            }
        }
    }

    public showPrompt(biomassCount: number, pepperSeeds: number, unlockCost: number = 3) {
        // Locked Overgrown Plot Prompt
        if (!this.isUnlocked) {
            if (biomassCount >= unlockCost) {
                this.promptText.setText(`Press [E] Clear Overgrowth (${unlockCost} Biomass)`);
                this.promptText.setColor("#55ff55");
            } else {
                this.promptText.setText(`Overgrown! Need ${unlockCost} Biomass!`);
                this.promptText.setColor("#ff5555");
            }
            return;
        }

        // Unlocked Plot Prompts
        if (this.fertility <= 0) {
            if (biomassCount > 0) {
                this.promptText.setText("Press [E] to Fertilize Soil (+100%)");
                this.promptText.setColor("#55ff55");
            } else {
                this.promptText.setText("Soil Depleted! Need 1 Biomass!");
                this.promptText.setColor("#ff5555");
            }
        } else if (this.state === CropState.EMPTY) {
            if (pepperSeeds <= 0) {
                // FIXED: ONLY Asks for Pepper Seed! NO Herb text!
                this.promptText.setText("Need 1 Pepper Seed!");
                this.promptText.setColor("#ff5555");
            } else {
                this.promptText.setText(`Press [E] Plant Pepper (Soil: ${this.fertility}/${this.maxFertility}%)`);
                this.promptText.setColor("#55ff55");
            }
        } else if (this.state === CropState.PLANTED || this.state === CropState.GROWING) {
            this.promptText.setText(`Growing Pepper... (Soil: ${this.fertility}/${this.maxFertility}%)`);
            this.promptText.setColor("#ffff55");
        } else if (this.state === CropState.MATURE) {
            this.promptText.setText("Press [E] to Harvest Pepper!");
            this.promptText.setColor("#ffaa00");
        }
    }

    public hidePrompt() {
        this.promptText.setText("");
    }

    public unlockPlot(): boolean {
        this.isUnlocked = true;
        this.clearTint();
        return true;
    }

    public fertilizeSoil(): boolean {
        if (this.fertility >= this.maxFertility) return false;
        this.fertility = Math.min(this.maxFertility, this.fertility + 100);
        this.clearTint();
        return true;
    }

    public setGlobalTier(newTier: number) {
        this.tier = newTier;
        if (this.tier === 2) {
            this.maxFertility = 200;
            this.fertility = Math.max(this.fertility, 200);
        } else if (this.tier === 3) {
            this.maxFertility = 400;
            this.fertility = Math.max(this.fertility, 400);
            this.setTint(0x44aaff);
        }
    }

    public plantSeed(cropType: string = "pepper"): boolean {
        if (!this.isUnlocked || this.state !== CropState.EMPTY || this.fertility <= 0) return false;

        this.state = CropState.PLANTED;
        this.cropType = cropType;
        this.growthTimer = 0;
        this.setTint(0x664422);
        return true;
    }

    public harvest(): { ammo: number; seeds: number } | null {
        if (!this.isUnlocked || this.state !== CropState.MATURE) return null;

        this.state = CropState.EMPTY;
        this.growthTimer = 0;

        const drainAmount = this.tier === 1 ? 25 : this.tier === 2 ? 15 : 10;
        this.fertility = Math.max(0, this.fertility - drainAmount);

        if (this.fertility <= 0) {
            this.setTint(0x777777);
        } else {
            this.clearTint();
        }

        const bonusSeed = Math.random() < 0.3 ? 1 : 0;

        return {
            ammo: 1,
            seeds: 1 + bonusSeed
        };
    }
}