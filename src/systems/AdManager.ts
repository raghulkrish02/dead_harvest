// Location: src/systems/AdManager.ts

import Phaser from "phaser";

export class AdManager {
    private static instance: AdManager;
    private gameRef!: Phaser.Game;
    private isAdActive: boolean = false;

    // ⏱️ Universal 75s Cooldown Engine
    private lastAdTimestamp: number = 0;
    private adCooldownDurationMs: number = 75000; // 75 Seconds

    private constructor() {}

    public static getInstance(): AdManager {
        if (!AdManager.instance) {
            AdManager.instance = new AdManager();
        }
        return AdManager.instance;
    }

    public init(game: Phaser.Game) {
        this.gameRef = game;
    }

    public getRemainingCooldownSeconds(): number {
        const elapsed = Date.now() - this.lastAdTimestamp;
        if (elapsed >= this.adCooldownDurationMs) return 0;
        return Math.ceil((this.adCooldownDurationMs - elapsed) / 1000);
    }

    public canPlayAd(): boolean {
        return this.getRemainingCooldownSeconds() === 0 && !this.isAdActive;
    }

    public playAd(adType: "midgame" | "rewarded", onComplete: (success: boolean) => void) {
        if (this.isAdActive) return;

        // Check 75s cooldown
        const remainingSecs = this.getRemainingCooldownSeconds();
        if (remainingSecs > 0) {
            console.warn(`[AdManager] Ad request blocked: On cooldown for ${remainingSecs}s`);
            onComplete(false);
            return;
        }

        this.isAdActive = true;
        this.suspendGameEngine();

        const sdk = (window as any).CrazyGames?.SDK;

        const onAdFinished = (success: boolean) => {
            this.lastAdTimestamp = Date.now(); // 🔒 Starts the 75s cooldown across all ads!
            this.startResumeCountdown(() => {
                this.isAdActive = false;
                onComplete(success);
            });
        };

        if (sdk) {
            if (adType === "rewarded") {
                sdk.ad.requestAd("rewarded", {
                    adStarted: () => console.log("[AdManager] Rewarded Ad Started"),
                    adFinished: () => onAdFinished(true),
                    adError: (error: any) => {
                        console.error("[AdManager] Ad Error:", error);
                        onAdFinished(false);
                    }
                });
            } else {
                sdk.ad.requestAd("midgame", {
                    adStarted: () => console.log("[AdManager] Midgame Ad Started"),
                    adFinished: () => onAdFinished(true),
                    adError: () => onAdFinished(true)
                });
            }
        } else {
            // Dev environment simulation
            console.log(`[Mock AdManager] Simulating 3s ${adType} ad...`);
            setTimeout(() => {
                onAdFinished(true);
            }, 3000);
        }
    }

    private suspendGameEngine() {
        if (!this.gameRef) return;
        this.gameRef.scene.getScenes(true).forEach((scene) => {
            scene.scene.pause();
            if (scene.physics) scene.physics.world.pause();
            if (scene.tweens) scene.tweens.pauseAll();
        });
        if (this.gameRef.sound) this.gameRef.sound.mute = true;
    }

    private startResumeCountdown(onFinished: () => void) {
        if (!this.gameRef) return;
        const activeScene = this.gameRef.scene.getScenes(true)[0];
        if (!activeScene) {
            this.resumeGameEngine();
            onFinished();
            return;
        }

        if (this.gameRef.sound) this.gameRef.sound.mute = false;
        activeScene.scene.resume();

        const zoom = activeScene.cameras.main.zoom || 1.25;
        const centerX = (activeScene.scale.width / zoom) / 2;
        const centerY = (activeScene.scale.height / zoom) / 2;

        const countdownText = activeScene.add.text(centerX, centerY, "RESUMING IN 3...", {
            fontFamily: "Arial",
            fontSize: "24px",
            color: "#ffcc00",
            stroke: "#000000",
            strokeThickness: 5
        }).setOrigin(0.5).setScrollFactor(0).setDepth(40000);

        let secondsLeft = 3;
        const interval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft > 0) {
                countdownText.setText(`RESUMING IN ${secondsLeft}...`);
            } else if (secondsLeft === 0) {
                countdownText.setText("GO!");
                countdownText.setColor("#55ff55");
            } else {
                clearInterval(interval);
                countdownText.destroy();
                this.resumeGameEngine();
                onFinished();
            }
        }, 1000);
    }

    private resumeGameEngine() {
        if (!this.gameRef) return;
        this.gameRef.scene.getScenes(false).forEach((scene) => {
            if (scene.scene.isPaused()) scene.scene.resume();
            if (scene.physics) scene.physics.world.resume();
            if (scene.tweens) scene.tweens.resumeAll();
        });
        if (this.gameRef.sound) this.gameRef.sound.mute = false;
    }
}