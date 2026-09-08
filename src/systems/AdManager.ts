import Phaser from "phaser";

export class AdManager {
    private static instance: AdManager;
    private game?: Phaser.Game;
    private lastAdTime: number = -999999;
    private cooldownSeconds: number = 60; // 60s cooldown between rewarded ad attempts
    private isAdPlaying: boolean = false;

    private constructor() {}

    public static getInstance(): AdManager {
        if (!AdManager.instance) {
            AdManager.instance = new AdManager();
        }
        return AdManager.instance;
    }

    public init(game: Phaser.Game) {
        this.game = game;
    }

    public getRemainingCooldownSeconds(): number {
        const now = Date.now() / 1000;
        const elapsed = now - this.lastAdTime;
        const remaining = Math.ceil(this.cooldownSeconds - elapsed);
        return Math.max(0, remaining);
    }

    public playAd(type: "rewarded" | "interstitial", callback: (success: boolean) => void): void {
        // Debounce: prevent overlapping ad calls
        if (this.isAdPlaying) {
            callback(false);
            return;
        }

        this.isAdPlaying = true;
        let hasResolved = false;

        // Guaranteed single-execution resolver
        const safeResolve = (success: boolean) => {
            if (hasResolved) return;
            hasResolved = true;
            this.isAdPlaying = false;

            if (success) {
                this.lastAdTime = Date.now() / 1000;
            }

            // Unmute game audio upon return
            if (this.game && this.game.sound) {
                this.game.sound.mute = false;
            }

            callback(success);
        };

        // 3.5s Watchdog Timer: Kills hanging SDK promises/callbacks
        const watchdog = setTimeout(() => {
            console.warn("[AdManager] Ad request timed out (Watchdog triggered). Resuming safely.");
            safeResolve(false);
        }, 3500);

        const onAdFinished = (success: boolean) => {
            clearTimeout(watchdog);
            safeResolve(success);
        };

        // Mute game audio during ad playback
        if (this.game && this.game.sound) {
            this.game.sound.mute = true;
        }

        try {
            const win = window as any;

            // 1. CrazyGames SDK Integration (v2 and v3)
            if (win.CrazyGames && win.CrazyGames.SDK) {
                const cgSDK = win.CrazyGames.SDK;
                if (cgSDK.ad && typeof cgSDK.ad.requestAd === "function") {
                    cgSDK.ad.requestAd(type, {
                        adStarted: () => {},
                        adFinished: () => onAdFinished(true),
                        adError: (error: any) => {
                            console.warn("[AdManager] CrazyGames Ad Error:", error);
                            onAdFinished(false);
                        }
                    });
                    return;
                }
            }

            // 2. Poki SDK Integration
            if (win.PokiSDK) {
                if (type === "rewarded" && typeof win.PokiSDK.rewardedBreak === "function") {
                    win.PokiSDK.rewardedBreak().then((withReward: boolean) => {
                        onAdFinished(withReward);
                    }).catch(() => onAdFinished(false));
                    return;
                } else if (typeof win.PokiSDK.commercialBreak === "function") {
                    win.PokiSDK.commercialBreak().then(() => onAdFinished(true)).catch(() => onAdFinished(false));
                    return;
                }
            }

            // 3. Fallback: Offline, Localhost, or Basic Launch with Ads Disabled
            console.log("[AdManager] SDK not detected or ads disabled in environment. Fallback invoked.");
            clearTimeout(watchdog);
            safeResolve(false);

        } catch (err) {
            console.error("[AdManager] Unexpected exception during ad call:", err);
            clearTimeout(watchdog);
            safeResolve(false);
        }
    }
}
