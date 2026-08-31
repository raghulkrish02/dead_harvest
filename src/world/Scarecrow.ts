import Phaser from "phaser";
import FarmPlot, { CropState } from "./FarmPlot";
import Backpack from "../systems/Backpack";

export default class Scarecrow extends Phaser.GameObjects.Sprite {
    public level: number = 1;
    private promptText: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, "stump");

    scene.add.existing(this);

    // EXACT CENTER ORIGIN & MATCHING 36x36 SIZE (Snaps dead-center into the hole!)
    this.setOrigin(0.5, 0.5); 
    this.setDisplaySize(36, 36);
    this.setDepth(y);
    this.setTint(0xffcc44);

    // Hovering prompt text directly above Totem
    this.promptText = scene.add.text(x, y - 25, "", {
        fontFamily: "Arial",
        fontSize: "11px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3
    }).setOrigin(0.5).setDepth(20000);
}

    public getHarvestLimit(): number {
        if (this.level === 1) return 2; // Level 1: Harvests max 2 plots
        if (this.level === 2) return 5; // Level 2: Harvests max 5 plots
        return 8;                       // Level 3: Harvests all 8 plots
    }

    public showPrompt(currentWave: number = 0) {
        const limit = this.getHarvestLimit();

        if (this.level === 1) {
            this.promptText.setText(`Press [E] Harvest (Max ${limit} Plots) | Press [U] Upgrade Totem (10 Biomass)`);
            this.promptText.setColor("#ffaa00");
        } else if (this.level === 2) {
            // Level 3 is LOCKED until Wave 5 is defeated!
            if (currentWave < 5) {
                this.promptText.setText(`Press [E] Harvest (Max ${limit} Plots) | Lvl 3 Locked! (Defeat Wave 5 Boss)`);
                this.promptText.setColor("#ffcc00");
            } else {
                this.promptText.setText(`Press [E] Harvest (Max ${limit} Plots) | Press [U] Upgrade Totem (20 Biomass)`);
                this.promptText.setColor("#55ff55");
            }
        } else {
            this.promptText.setText(`Press [E] Harvest All ${limit} Plots (MAX LEVEL)`);
            this.promptText.setColor("#44aaff");
        }
    }


    public hidePrompt() {
        this.promptText.setText("");
    }

    public upgradeTotem(backpack: Backpack, farmPlots: FarmPlot[], scene: Phaser.Scene, currentWave: number = 0): boolean {
        if (this.level >= 3) return false;

        // Block Level 3 upgrade during Waves 1–4
        if (this.level === 2 && currentWave < 5) {
            return false;
        }

        const upgradeCost = this.level === 1 ? 10 : 20;
        if (backpack.biomassCount < upgradeCost) return false;

        backpack.addBiomass(-upgradeCost);
        this.level += 1;

        farmPlots.forEach(plot => plot.setGlobalTier(this.level));

        // Lvl 2 = 2 Charges | Lvl 3 = 3 Charges
        backpack.setMaxRootCharges(this.level === 2 ? 2 : 3);

        if (this.level === 2) this.setTint(0x55ff55);
        if (this.level === 3) this.setTint(0x44aaff);

        scene.cameras.main.shake(80, 0.004);
        return true;
    }

    // Vacuum Harvests BOTH Ammo AND Seeds from mature crops!
    public vacuumHarvestAll(farmPlots: FarmPlot[], backpack: Backpack, scene: Phaser.Scene): { totalAmmo: number; totalSeeds: number } {
        const limit = this.getHarvestLimit();
        let harvestedCount = 0;
        let totalAmmo = 0;
        let totalSeeds = 0;

        for (const plot of farmPlots) {
            if (harvestedCount >= limit) break;

            if (plot.state === CropState.MATURE) {
                const yieldData = plot.harvest();
                if (yieldData) {
                    totalAmmo += yieldData.ammo;
                    totalSeeds += yieldData.seeds; // COLLECT SEEDS!
                    harvestedCount++;
                }
            }
        }

        if (totalAmmo > 0 || totalSeeds > 0) {
            backpack.addPepperAmmo(totalAmmo);
            backpack.addPepperSeeds(totalSeeds); // ADD SEEDS TO BACKPACK!
            scene.cameras.main.shake(60, 0.003);
        }

        return { totalAmmo, totalSeeds };
    }
}