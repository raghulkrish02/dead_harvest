import Phaser from "phaser";
import FarmPlot, { CropState } from "./FarmPlot";
import Backpack from "../systems/Backpack";

export default class Scarecrow extends Phaser.GameObjects.Sprite {
    public level: number = 1;
    private promptText: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y, "stump");

        scene.add.existing(this);
        this.setOrigin(0.5, 0.5);
        this.setDisplaySize(36, 36);
        this.setDepth(y);
        this.setTint(0xffcc44);

        this.promptText = scene.add.text(x, y - 25, "", {
            fontFamily: "Arial",
            fontSize: "11px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(20000);
    }

    public getHarvestLimit(): number {
        if (this.level === 1) return 3;
        if (this.level === 2) return 6;
        return 8;
    }

    public getDepletedPlots(farmPlots: FarmPlot[]): FarmPlot[] {
        return farmPlots.filter(p => p.isUnlocked && p.harvestsLeft <= 0);
    }

    public hasMatureCrops(farmPlots: FarmPlot[]): boolean {
        return farmPlots.some(p => p.isUnlocked && p.state === CropState.MATURE);
    }

    public showPrompt(currentWave: number = 0, farmPlots?: FarmPlot[], biomassCount: number = 0) {
        const hasMature = farmPlots ? this.hasMatureCrops(farmPlots) : false;
        const depleted = farmPlots ? this.getDepletedPlots(farmPlots) : [];
        const limit = this.getHarvestLimit();

        // 🌾 Priority 1: Mature crops need harvesting
        if (hasMature) {
            this.promptText.setText(`Press [E] Harvest (Max ${limit}) | [U] Upgrade`);
            this.promptText.setColor("#ffaa00");
        }
        // 🌿 Priority 2: Soil is depleted (Prompt switches to Slurry Pulse)
        else if (depleted.length > 0) {
            const countToFill = Math.min(biomassCount, depleted.length);
            if (biomassCount > 0) {
                this.promptText.setText(`Press [E] Slurry Pulse: Refill ${countToFill}/${depleted.length} Plots (-${countToFill} Bio) | [U] Upgrade`);
                this.promptText.setColor("#55ff55");
            } else {
                this.promptText.setText(`${depleted.length} Plots Depleted! Need Biomass | [U] Upgrade`);
                this.promptText.setColor("#ff5555");
            }
        }
        // 👑 Priority 3: All soil is fresh (Show Totem Level & Upgrade)
        else {
            if (this.level === 1) {
                this.promptText.setText(`Totem Lvl 1 | Press [U] Upgrade Totem (10 Biomass)`);
                this.promptText.setColor("#ffaa00");
            } else if (this.level === 2) {
                if (currentWave < 5) {
                    this.promptText.setText(`Totem Lvl 2 | Lvl 3 Locked (Defeat Wave 5 Boss)`);
                    this.promptText.setColor("#ffcc00");
                } else {
                    this.promptText.setText(`Totem Lvl 2 | Press [U] Upgrade Totem (20 Biomass)`);
                    this.promptText.setColor("#55ff55");
                }
            } else {
                this.promptText.setText(`Totem Lvl 3 (MAX LEVEL)`);
                this.promptText.setColor("#44aaff");
            }
        }
    }

    public hidePrompt() {
        this.promptText.setText("");
    }

    public slurryPulse(farmPlots: FarmPlot[], backpack: Backpack, scene: Phaser.Scene): number {
        const depleted = this.getDepletedPlots(farmPlots);
        if (depleted.length === 0 || backpack.biomassCount <= 0) return 0;

        // Proportional 1:1 refill (only refills depleted plots, leaves healthy ones alone)
        const countToRefill = Math.min(backpack.biomassCount, depleted.length);
        backpack.addBiomass(-countToRefill);

        for (let i = 0; i < countToRefill; i++) {
            depleted[i].fertilizeSoil();
        }

        // 🌟 Radiant Emerald Slurry Pulse Shockwave
        const pulse = scene.add.circle(this.x, this.y, 14, 0x33ff66, 0.85);
        pulse.setStrokeStyle(4, 0xaaff88).setBlendMode(Phaser.BlendModes.ADD).setDepth(25000);
        scene.tweens.add({
            targets: pulse,
            radius: 160,
            alpha: 0,
            duration: 450,
            ease: "Cubic.easeOut",
            onComplete: () => pulse.destroy()
        });

        scene.cameras.main.shake(60, 0.003);
        return countToRefill;
    }

    public upgradeTotem(backpack: Backpack, farmPlots: FarmPlot[], scene: Phaser.Scene, currentWave: number = 0): boolean {
        if (this.level >= 3) return false;
        if (this.level === 2 && currentWave < 5) return false;

        const upgradeCost = this.level === 1 ? 10 : 20;
        if (backpack.biomassCount < upgradeCost) return false;

        backpack.addBiomass(-upgradeCost);
        this.level += 1;

        farmPlots.forEach(plot => plot.setGlobalTier(this.level));
        backpack.setMaxRootCharges(this.level === 2 ? 2 : 3);

        if (this.level === 2) this.setTint(0x55ff55);
        if (this.level === 3) this.setTint(0x44aaff);

        scene.cameras.main.shake(80, 0.004);
        return true;
    }

    public vacuumHarvestAll(farmPlots: FarmPlot[], backpack: Backpack, scene: Phaser.Scene): { totalAmmo: number; totalSeeds: number; totalPumpkins: number } {
        const limit = this.getHarvestLimit();
        let harvestedCount = 0;
        let totalAmmo = 0;
        let totalSeeds = 0;
        let totalPumpkins = 0;

        for (const plot of farmPlots) {
            if (harvestedCount >= limit) break;

            if (plot.state === CropState.MATURE) {
                const yieldData = plot.harvest();
                if (yieldData) {
                    if (yieldData.ammo > 0) totalAmmo += yieldData.ammo;
                    if (yieldData.seeds > 0) totalSeeds += yieldData.seeds;
                    if (yieldData.pumpkins > 0) totalPumpkins += yieldData.pumpkins;
                    if (yieldData.pumpkinSeeds > 0) backpack.addPumpkinSeeds(yieldData.pumpkinSeeds);
                    harvestedCount++;
                }
            }
        }

        if (totalAmmo > 0 || totalSeeds > 0 || totalPumpkins > 0) {
            if (totalAmmo > 0) backpack.addPepperAmmo(totalAmmo);
            if (totalSeeds > 0) backpack.addPepperSeeds(totalSeeds);
            if (totalPumpkins > 0) backpack.addIronPumpkins(totalPumpkins);
            scene.cameras.main.shake(60, 0.003);
        }

        return { totalAmmo, totalSeeds, totalPumpkins };
    }
}
