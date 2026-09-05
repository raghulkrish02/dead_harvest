import Phaser from "phaser";
import Zombie from "../enemies/Zombie";
import { FenceManager } from "../world/Fence";

export interface WaveConfig {
    waveNumber: number;
    totalZombies: number;
    spawnIntervalMs: number;
    runnerRatio: number;
    bruteCount: number;
    bossType?: "TITAN" | "HIVE" | "ABOMINATION";
}

export default class WaveManager {
    private scene: Phaser.Scene;
    public currentWave: number = 0;
    public isWaveActive: boolean = false;
    public wasWaveDefeated: boolean = false;
    public totalZombiesInWave: number = 0;
    public zombiesSpawnedCount: number = 0;
    
    public zombieGroup!: Phaser.Physics.Arcade.Group;
    private waveConfigs: WaveConfig[] = [];
    private spawnTimerEvent?: Phaser.Time.TimerEvent;

    private brutesSpawnedThisWave: number = 0;
    private currentWaveConfig!: WaveConfig;

    public activeBoss?: Zombie;
    private bossSpawnedThisWave: boolean = false;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;

        this.zombieGroup = this.scene.physics.add.group();
        this.scene.physics.add.collider(this.zombieGroup, this.zombieGroup);

        const mainScene = this.scene as any;

        if (mainScene.player) {
            this.scene.physics.add.collider(mainScene.player, this.zombieGroup);
        }
        if (mainScene.world && mainScene.world.treeBottomGroup) {
            this.scene.physics.add.collider(this.zombieGroup, mainScene.world.treeBottomGroup);
        }
        if (mainScene.world && mainScene.world.rockGroup) {
            this.scene.physics.add.collider(this.zombieGroup, mainScene.world.rockGroup);
        }

        // Direct Fence Collision & Attack Callback
        if (mainScene.fenceManager && mainScene.fenceManager.fenceGroup) {
            this.scene.physics.add.collider(
                this.zombieGroup,
                mainScene.fenceManager.fenceGroup,
                (zombieObj, fenceObj) => {
                    const zombie = zombieObj as Zombie;
                    const fenceSprite = fenceObj as Phaser.GameObjects.Sprite;
                    const fenceData = fenceSprite.getData("fenceData");

                    if (zombie && zombie.active && fenceData && fenceData.state === "INTACT") {
                        zombie.attackFence(fenceData, mainScene.fenceManager, mainScene.player.x, mainScene.player.y);
                    }
                }
            );
        }

        this.initWaveConfigs();
    }

    private initWaveConfigs() {
        this.waveConfigs = [
            { waveNumber: 1, totalZombies: 8,  spawnIntervalMs: 1400, runnerRatio: 0.0,  bruteCount: 0 },
            { waveNumber: 2, totalZombies: 18, spawnIntervalMs: 1000, runnerRatio: 0.20, bruteCount: 0 },
            { waveNumber: 3, totalZombies: 28, spawnIntervalMs: 800,  runnerRatio: 0.28, bruteCount: 1 },
            { waveNumber: 4, totalZombies: 40, spawnIntervalMs: 650,  runnerRatio: 0.35, bruteCount: 2 },
            { waveNumber: 5, totalZombies: 50, spawnIntervalMs: 550,  runnerRatio: 0.36, bruteCount: 3, bossType: "TITAN" },
        ];
    }

    public getActiveZombies(): Zombie[] {
        return this.zombieGroup.getChildren().filter(z => z && z.active) as Zombie[];
    }

    public getRemainingZombieCount(): number {
        const activeCount = this.getActiveZombies().length;
        const unspawnedCount = Math.max(0, this.totalZombiesInWave - this.zombiesSpawnedCount);
        return activeCount + unspawnedCount;
    }

    public startNextWave(playerX: number, playerY: number) {
        if (this.isWaveActive) return;

        this.currentWave++;
        this.isWaveActive = true;
        this.wasWaveDefeated = false;
        this.brutesSpawnedThisWave = 0;
        this.bossSpawnedThisWave = false;
        this.activeBoss = undefined;

        this.currentWaveConfig = this.waveConfigs.find(w => w.waveNumber === this.currentWave) || {
            waveNumber: this.currentWave,
            totalZombies: 10 + (this.currentWave * 4),
            spawnIntervalMs: Math.max(500, 2000 - (this.currentWave * 100)),
            runnerRatio: Math.min(0.7, 0.15 * this.currentWave),
            bruteCount: Math.floor(this.currentWave / 2)
        };

        this.totalZombiesInWave = this.currentWaveConfig.totalZombies;
        this.zombiesSpawnedCount = 0;

        // Spawn first minion
        this.zombiesSpawnedCount++;
        this.spawnOffScreenZombie(playerX, playerY);

        if (this.currentWaveConfig.totalZombies > 1) {
            this.spawnTimerEvent = this.scene.time.addEvent({
                delay: this.currentWaveConfig.spawnIntervalMs,
                repeat: this.currentWaveConfig.totalZombies - 2,
                callback: () => {
                    this.zombiesSpawnedCount++;
                    this.spawnOffScreenZombie(playerX, playerY);
                }
            });
        }
    }

    private spawnOffScreenZombie(playerX: number, playerY: number) {
        const radius = 700;
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);

        let spawnX = playerX + Math.cos(angle) * radius;
        let spawnY = playerY + Math.sin(angle) * radius;

        spawnX = Phaser.Math.Clamp(spawnX, 128, 3072);
        spawnY = Phaser.Math.Clamp(spawnY, 128, 3072);

        let selectedType: "WALKER" | "RUNNER" | "BRUTE" | "TITAN" = "WALKER";

        // 👑 1. DYNAMIC LIVE-TRACKING METEOR DROP FOR ROTTING TITAN!
        if (this.currentWaveConfig.bossType === "TITAN" && !this.bossSpawnedThisWave && this.zombiesSpawnedCount >= 5) {
            this.bossSpawnedThisWave = true;
            const mainScene = this.scene as any;

            // 🌑 Telegraph Warning & Siren
            mainScene.cameras.main.shake(120, 0.005);
            mainScene.showFloatingText?.(playerX, playerY - 110, "👑 THE ROTTING TITAN DESCENDS!", "#ff3333", 2500);

            let targetLandingX = playerX + (mainScene.player?.flipX ? -120 : 120);
            let targetLandingY = playerY - 20;

            const meteorShadow = this.scene.add.circle(targetLandingX, targetLandingY, 20, 0xff0000, 0.5);
            meteorShadow.setStrokeStyle(3, 0xffaa00).setDepth(15000);

            // 🎯 Phase A: Track Player's Live Position for 650ms
            const trackingTimer = this.scene.time.addEvent({
                delay: 16,
                repeat: 40, // 40 * 16ms = ~640ms of active tracking
                callback: () => {
                    if (!mainScene.player || !meteorShadow.active) return;
                    const p = mainScene.player;
                    const leadX = p.flipX ? -110 : 110;
                    targetLandingX = Phaser.Math.Clamp(p.x + leadX, 200, 2872);
                    targetLandingY = Phaser.Math.Clamp(p.y - 20, 200, 2872);
                    meteorShadow.setPosition(targetLandingX, targetLandingY);
                }
            });

            // 🎯 Phase B: Expand shadow and lock target for impact
            this.scene.tweens.add({
                targets: meteorShadow,
                radius: 100,
                alpha: 0.85,
                duration: 1000,
                ease: "Cubic.easeOut",
                onComplete: () => {
                    trackingTimer.remove();
                    meteorShadow.destroy();

                    // 💥 METEOR IMPACT CRASH AT THE LOCKED LIVE SPOT!
                    const titan = new Zombie(this.scene, targetLandingX, targetLandingY, "TITAN");
                    this.zombieGroup.add(titan);
                    this.activeBoss = titan;

                    // Huge Impact VFX & Camera Shudder
                    this.scene.cameras.main.shake(300, 0.02);

                    const impactRing = this.scene.add.circle(targetLandingX, targetLandingY, 100, 0xff3300, 0.7);
                    impactRing.setStrokeStyle(4, 0xffff00).setDepth(15000);
                    this.scene.tweens.add({
                        targets: impactRing,
                        scale: 1.4,
                        alpha: 0,
                        duration: 400,
                        onComplete: () => impactRing.destroy()
                    });

                    // ⚡ 8 Unavoidable Shockwave Tremor Damage
                    if (mainScene.player) {
                        mainScene.player.takeDamage(8);
                        const knockDir = new Phaser.Math.Vector2(mainScene.player.x - targetLandingX, mainScene.player.y - targetLandingY).normalize();
                        mainScene.player.applyKnockback(knockDir.x, knockDir.y, 250, 150);
                    }
                }
            });
            return;
        } else {
            const remainingSpawns = this.totalZombiesInWave - this.zombiesSpawnedCount;
            const remainingBrutesNeeded = this.currentWaveConfig.bruteCount - this.brutesSpawnedThisWave;

            if (remainingBrutesNeeded > 0 && (Math.random() < 0.35 || remainingSpawns <= remainingBrutesNeeded)) {
                selectedType = "BRUTE";
                this.brutesSpawnedThisWave++;
            } else if (Math.random() < this.currentWaveConfig.runnerRatio) {
                selectedType = "RUNNER";
            }
        }

        const zombie = new Zombie(this.scene, spawnX, spawnY, selectedType);
        this.zombieGroup.add(zombie);

        if (selectedType === "TITAN") {
            this.activeBoss = zombie;
        }
    }

    public updateWaves(playerX: number, playerY: number, _fenceManager: FenceManager) {
        if (!this.isWaveActive) return;

        const activeZombies = this.getActiveZombies();

        activeZombies.forEach((zombie) => {
            if (!zombie.active || zombie.isKnockedBack) return;
            zombie.update(playerX, playerY);
        });

        if (this.zombiesSpawnedCount >= this.totalZombiesInWave && activeZombies.length === 0) {
            this.isWaveActive = false;
            this.wasWaveDefeated = false;
            if (this.spawnTimerEvent) this.spawnTimerEvent.remove();
        }
    }

    public onWaveFailed() {
        if (this.spawnTimerEvent) {
            this.spawnTimerEvent.remove();
        }
        this.getActiveZombies().forEach(z => z.destroy());
        this.isWaveActive = false;
        this.wasWaveDefeated = true;
        this.currentWave = Math.max(0, this.currentWave - 1);
    }

    public clearWave() {
        if (this.spawnTimerEvent) {
            this.spawnTimerEvent.remove();
        }
        this.zombiesSpawnedCount = this.totalZombiesInWave;
        this.getActiveZombies().forEach(z => z.destroy());
        this.isWaveActive = false;
    }
}