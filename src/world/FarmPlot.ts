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
    
    public isUnlocked: boolean = true;
    public tier: number = 1;

    // 🌾 DISCRETE HARVEST COUNTERS (Zero Math Leaks!)
    public harvestsLeft: number = 4;
    public maxHarvests: number = 4;
    public fertility: number = 100; // Compatibility property

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

    private getMaxHarvestsForTier(tier: number): number {
        if (tier === 1) return 4;
        if (tier === 2) return 6;
        return 10;
    }

    public updatePlot(delta: number) {
        const tierSpeedMultiplier = 1 + (this.tier - 1) * 0.25;
        const lowSoilPenalty = this.harvestsLeft > 1 ? 1.0 : 0.75;
        const currentGrowthDuration = this.baseGrowthDuration / tierSpeedMultiplier;

        if (this.isUnlocked && (this.state === CropState.PLANTED || this.state === CropState.GROWING)) {
            this.growthTimer += delta * lowSoilPenalty;

            if (this.state === CropState.PLANTED && this.growthTimer >= currentGrowthDuration / 2) {
                this.state = CropState.GROWING;
                this.setTint(0x55ff55);
            }

            if (this.state === CropState.GROWING && this.growthTimer >= currentGrowthDuration) {
                this.state = CropState.MATURE;
                this.setTint(0xffaa00);
            }
        }
    }

    public showPrompt(biomassCount: number, pepperSeeds: number, unlockCost: number = 3) {
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

        // 0 Harvests Left = Soil Depleted
        if (this.harvestsLeft <= 0) {
            if (biomassCount > 0) {
                this.promptText.setText(`Press [E] Fertilize Soil (1 Biomass ➔ ${this.maxHarvests}/${this.maxHarvests})`);
                this.promptText.setColor("#55ff55");
            } else {
                this.promptText.setText("Soil Depleted! Need 1 Biomass!");
                this.promptText.setColor("#ff5555");
            }
        } else if (this.state === CropState.EMPTY) {
            if (pepperSeeds <= 0) {
                this.promptText.setText("Need 1 Pepper Seed!");
                this.promptText.setColor("#ff5555");
            } else {
                this.promptText.setText(`Press [E] Plant Pepper (Soil: ${this.harvestsLeft}/${this.maxHarvests})`);
                this.promptText.setColor("#55ff55");
            }
        } else if (this.state === CropState.PLANTED || this.state === CropState.GROWING) {
            this.promptText.setText(`Growing Pepper... (Soil: ${this.harvestsLeft}/${this.maxHarvests})`);
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
        this.maxHarvests = this.getMaxHarvestsForTier(this.tier);
        this.harvestsLeft = this.maxHarvests;
        this.fertility = 100;
        this.clearTint();

        if (this.tier === 2) this.setTint(0x88ff88);
        else if (this.tier === 3) this.setTint(0x44aaff);
        return true;
    }

    public fertilizeSoil(): boolean {
        this.maxHarvests = this.getMaxHarvestsForTier(this.tier);
        if (this.harvestsLeft >= this.maxHarvests) return false;
        
        this.harvestsLeft = this.maxHarvests;
        this.fertility = 100;
        this.clearTint();

        if (this.tier === 2) this.setTint(0x88ff88);
        else if (this.tier === 3) this.setTint(0x44aaff);
        return true;
    }

    public setGlobalTier(newTier: number) {
        this.tier = newTier;
        this.maxHarvests = this.getMaxHarvestsForTier(this.tier);

        if (!this.isUnlocked) {
            this.setTint(0x443322); // Keep dark overgrown tint for locked plots
            return;
        }

        this.harvestsLeft = this.maxHarvests;
        this.fertility = 100;
        this.clearTint();

        if (this.tier === 2) this.setTint(0x88ff88);
        if (this.tier === 3) this.setTint(0x44aaff);
    }

    public plantSeed(cropType: string = "pepper"): boolean {
        if (!this.isUnlocked || this.state !== CropState.EMPTY || this.harvestsLeft <= 0) return false;

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

        this.harvestsLeft = Math.max(0, this.harvestsLeft - 1);
        this.fertility = Math.round((this.harvestsLeft / this.maxHarvests) * 100);

        if (this.harvestsLeft <= 0) {
            this.setTint(0x777777);
        } else {
            if (this.tier === 2) this.setTint(0x88ff88);
            else if (this.tier === 3) this.setTint(0x44aaff);
            else this.clearTint();
        }

        // 🌶️ FARM MUNITIONS SCALING: Tier 1 = 2 Ammo | Tier 2 = 3 Ammo | Tier 3 = 4 Ammo
        const ammoYield = this.tier === 1 ? 2 : (this.tier === 2 ? 3 : 4);
        const bonusSeed = Math.random() < 0.35 ? 2 : 1;

        return {
            ammo: ammoYield,
            seeds: bonusSeed
        };
    }
}