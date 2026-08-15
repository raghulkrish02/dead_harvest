import Phaser from "phaser";

export class AdManager {
    private static instance: AdManager;
    private gameRef!: Phaser.Game;
    private isAdActive: boolean = false;

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

    // Safely wraps CrazyGames / Poki Ad requests with a 3s safety unpause countdown
    public playAd(adType: "midgame" | "rewarded", onComplete: (success: boolean) => void) {
        if (this.isAdActive) return;
        this.isAdActive = true;

        this.suspendGameEngine();

        const sdk = (window as any).CrazyGames?.SDK;

        if (sdk) {
            if (adType === "rewarded") {
                sdk.ad.requestAd("rewarded", {
                    adStarted: () => console.log("[AdManager] Rewarded Ad Started"),
                    adFinished: () => {
                        this.startResumeCountdown(() => {
                            this.isAdActive = false;
                            onComplete(true); // Grant Reward (Revive / Full Fence Repair)
                        });
                    },
                    adError: (error: any) => {
                        console.error("[AdManager] Ad Error:", error);
                        this.startResumeCountdown(() => {
                            this.isAdActive = false;
                            onComplete(false);
                        });
                    }
                });
            } else {
                sdk.ad.requestAd("midgame", {
                    adStarted: () => console.log("[AdManager] Midgame Ad Started"),
                    adFinished: () => {
                        this.startResumeCountdown(() => {
                            this.isAdActive = false;
                            onComplete(true);
                        });
                    },
                    adError: () => {
                        this.startResumeCountdown(() => {
                            this.isAdActive = false;
                            onComplete(true);
                        });
                    }
                });
            }
        } else {
            // Local Vite Dev Mock Mode (3s Ad + 3s Countdown)
            console.log(`[Mock AdManager] Simulating 3s ${adType} ad...`);
            setTimeout(() => {
                this.startResumeCountdown(() => {
                    this.isAdActive = false;
                    onComplete(true);
                });
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

        if (this.gameRef.sound) {
            this.gameRef.sound.mute = true;
        }
    }

    // Displays a 3-second countdown before unpausing physics
    private startResumeCountdown(onFinished: () => void) {
        if (!this.gameRef) return;

        const activeScene = this.gameRef.scene.getScenes(true)[0];
        if (!activeScene) {
            this.resumeGameEngine();
            onFinished();
            return;
        }

        // Unmute audio & resume scene rendering (keep physics paused)
        if (this.gameRef.sound) this.gameRef.sound.mute = false;
        activeScene.scene.resume();

        // Screen Center for Countdown Banner
        const zoom = activeScene.cameras.main.zoom || 1;
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
            if (scene.scene.isPaused()) {
                scene.scene.resume();
            }
            if (scene.physics) {
                scene.physics.world.resume();
            }
            if (scene.tweens) {
                scene.tweens.resumeAll();
            }
        });

        if (this.gameRef.sound) {
            this.gameRef.sound.mute = false;
        }
    }
}