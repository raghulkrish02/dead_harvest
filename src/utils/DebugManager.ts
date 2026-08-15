import Phaser from "phaser";
import Player from "../player/Player";
import WaveManager from "../systems/WaveManager";
import Backpack from "../systems/Backpack";
import FarmPlot, { CropState } from "../world/FarmPlot";

export default class DebugManager {
    private scene: Phaser.Scene;
    private player: Player;
    private waveManager: WaveManager;
    private backpack: Backpack;
    private farmPlots: FarmPlot[];

    constructor(
        scene: Phaser.Scene,
        player: Player,
        waveManager: WaveManager,
        backpack: Backpack,
        farmPlots: FarmPlot[]
    ) {
        this.scene = scene;
        this.player = player;
        this.waveManager = waveManager;
        this.backpack = backpack;
        this.farmPlots = farmPlots;

        this.initDebugKeybinds();
    }

    private initDebugKeybinds() {
        if (!this.scene.input.keyboard) return;

        // [K]: Nuke all zombies & complete wave
        const keyK = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K);
        keyK.on("down", () => {
            if (this.waveManager && this.waveManager.isWaveActive) {
                this.waveManager.clearWave();
                this.showDebugText("DEBUG: Wave Nuked & Cleared!");
            }
        });

        // [L]: Add +50 Biomass, +50 Ammo, +20 Seeds
        const keyL = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L);
        keyL.on("down", () => {
            this.backpack.addBiomass(50);
            this.backpack.addPepperAmmo(50);
            this.backpack.addPepperSeeds(20);
            this.showDebugText("DEBUG: +50 Biomass, Ammo & Seeds!");
        });

        // [T]: Instantly mature all growing crops
        const keyT = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
        keyT.on("down", () => {
            this.farmPlots.forEach((plot) => {
                if (plot.state === CropState.PLANTED || plot.state === CropState.GROWING) {
                    plot.state = CropState.MATURE;
                    plot.setTint(0xffaa00);
                }
            });
            this.showDebugText("DEBUG: All Crops Matured!");
        });

        // [1] & [5]: Jump directly to Wave 1 or Wave 5
        const key1 = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
        const key5 = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE);

        key1.on("down", () => this.jumpToWave(1));
        key5.on("down", () => this.jumpToWave(5));
    }

    private jumpToWave(waveNum: number) {
        this.waveManager.clearWave();
        this.waveManager.currentWave = waveNum - 1;
        this.waveManager.startNextWave(this.player.x, this.player.y);
        this.showDebugText(`DEBUG: Jumped to Wave ${waveNum}!`);
    }

    private showDebugText(text: string) {
        const popup = this.scene.add.text(this.player.x, this.player.y - 45, text, {
            fontFamily: "Arial",
            fontSize: "14px",
            color: "#ffaa00",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(30000);

        this.scene.tweens.add({
            targets: popup,
            y: popup.y - 20,
            alpha: 0,
            duration: 800,
            onComplete: () => popup.destroy()
        });
    }
}