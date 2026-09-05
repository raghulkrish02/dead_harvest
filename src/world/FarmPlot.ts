import Phaser from "phaser";

export enum CropState {
    EMPTY = "EMPTY",
    PLANTED = "PLANTED",
    GROWING = "GROWING",
    MATURE = "MATURE"
}

export default class FarmPlot extends Phaser.GameObjects.Sprite {
    public state: CropState = CropState.EMPTY;
    public cropType: "pepper" | "pumpkin" = "pepper";
    
    public isUnlocked: boolean = true;
    public tier: number = 1;

    public harvestsLeft: number = 4;
    public maxHarvests: number = 4;
    public fertility: number = 100;

    private growthTimer: number = 0;
    private baseGrowthDuration: number = 4000;
    private promptText: Phaser.GameObjects.Text;
    public lastHarvestTime: number = 0; // 👈 Immunity debounce timer

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

    private getMaxHarvestsForTier(tier: number): number {
        if (tier === 1) return 4;
        if (tier === 2) return 6;
        return 10;
    }

    public updatePlot(delta: number) {
        const tierSpeedMultiplier = 1 + (this.tier - 1) * 0.25;
        const lowSoilPenalty = this.harvestsLeft > 1 ? 1.0 : 0.75;
        
        // Pumpkins take 7s to grow; Peppers take 4s
        const cropDuration = this.cropType === "pumpkin" ? 7000 : this.baseGrowthDuration;
        const currentGrowthDuration = cropDuration / tierSpeedMultiplier;

        if (this.isUnlocked && (this.state === CropState.PLANTED || this.state === CropState.GROWING)) {
            this.growthTimer += delta * lowSoilPenalty;

            if (this.state === CropState.PLANTED && this.growthTimer >= currentGrowthDuration / 2) {
                this.state = CropState.GROWING;
                this.setTint(this.cropType === "pumpkin" ? 0x88cc44 : 0x55ff55);
            }

            if (this.state === CropState.GROWING && this.growthTimer >= currentGrowthDuration) {
                this.state = CropState.MATURE;
                this.setTint(this.cropType === "pumpkin" ? 0xff7700 : 0xffaa00);
            }
        }
    }

    public showPrompt(biomassCount: number, activeSeed: "pepper" | "pumpkin", seedCount: number, unlockCost: number = 3) {
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

        if (this.harvestsLeft <= 0) {
            if (biomassCount > 0) {
                this.promptText.setText(`Press [E] Fertilize Soil (1 Biomass ➔ ${this.maxHarvests}/${this.maxHarvests})`);
                this.promptText.setColor("#55ff55");
            } else {
                this.promptText.setText("Soil Depleted! Need 1 Biomass!");
                this.promptText.setColor("#ff5555");
            }
        } else if (this.state === CropState.EMPTY) {
            const cropName = activeSeed === "pepper" ? "🌶️ Pepper" : "🎃 Pumpkin";
            if (seedCount <= 0) {
                this.promptText.setText(`Need 1 ${cropName} Seed! ([TAB] Switch)`);
                this.promptText.setColor("#ff5555");
            } else {
                this.promptText.setText(`Press [E] Plant ${cropName} (Soil: ${this.harvestsLeft}/${this.maxHarvests})`);
                this.promptText.setColor("#55ff55");
            }
        } else if (this.state === CropState.PLANTED || this.state === CropState.GROWING) {
            const cropName = this.cropType === "pepper" ? "Pepper 🌶️" : "Pumpkin 🎃";
            this.promptText.setText(`Growing ${cropName}... (Soil: ${this.harvestsLeft}/${this.maxHarvests})`);
            this.promptText.setColor("#ffff55");
        } else if (this.state === CropState.MATURE) {
            const cropName = this.cropType === "pepper" ? "Pepper 🌶️" : "Pumpkin 🎃";
            this.promptText.setText(`Press [E] Harvest ${cropName}!`);
            this.promptText.setColor("#ffaa00");
        }
    }

    public hidePrompt() {
        this.promptText.setText("");
    }

    public unlockPlot(): boolean {
        this.isUnlocked = true;
        this.maxHarvests = this.getMaxHarvestsForTier(this.tier);
        this.harvestsLeft = this.maxHarvests;
        this.fertility = 100;
        this.clearTint();
        return true;
    }

    public fertilizeSoil(): boolean {
        this.maxHarvests = this.getMaxHarvestsForTier(this.tier);
        if (this.harvestsLeft >= this.maxHarvests) return false;
        
        this.harvestsLeft = this.maxHarvests;
        this.fertility = 100;
        this.clearTint();
        return true;
    }

    public setGlobalTier(newTier: number) {
        this.tier = newTier;
        this.maxHarvests = this.getMaxHarvestsForTier(this.tier);

        if (!this.isUnlocked) {
            this.setTint(0x443322);
            return;
        }

        this.harvestsLeft = this.maxHarvests;
        this.fertility = 100;
        this.clearTint();
    }

    public plantSeed(cropType: "pepper" | "pumpkin" = "pepper"): boolean {
        if (!this.isUnlocked || this.state !== CropState.EMPTY || this.harvestsLeft <= 0) return false;

        this.state = CropState.PLANTED;
        this.cropType = cropType;
        this.growthTimer = 0;
        this.setTint(cropType === "pumpkin" ? 0x665522 : 0x664422);
        return true;
    }

    public harvest(): { ammo: number; seeds: number; pumpkins: number; pumpkinSeeds: number } | null {
        if (!this.isUnlocked || this.state !== CropState.MATURE) return null;

        const harvestedType = this.cropType;
        this.state = CropState.EMPTY;
        this.growthTimer = 0;
        this.lastHarvestTime = this.scene.time.now + 450; // 👈 Protects plot from accidental auto-sowing!

        this.harvestsLeft = Math.max(0, this.harvestsLeft - 1);
        this.fertility = Math.round((this.harvestsLeft / this.maxHarvests) * 100);

        if (this.harvestsLeft <= 0) {
            this.setTint(0x777777);
        } else {
            this.clearTint();
        }

        if (harvestedType === "pumpkin") {
            const bonusPumpkinSeed = Math.random() < 0.35 ? 2 : 1;
            return {
                ammo: 0,
                seeds: 0,
                pumpkins: 1,
                pumpkinSeeds: bonusPumpkinSeed
            };
        } else {
            // 🌶️ NORMALIZED PEPPER YIELD: Tier 1 = 1 Ammo (Prevents Day 1 glut) | Tier 2 = 2 Ammo
            const ammoYield = this.tier === 1 ? 1 : 2;
            const bonusSeed = Math.random() < 0.35 ? 2 : 1;
            return {
                ammo: ammoYield,
                seeds: bonusSeed,
                pumpkins: 0,
                pumpkinSeeds: 0
            };
        }
    }
}