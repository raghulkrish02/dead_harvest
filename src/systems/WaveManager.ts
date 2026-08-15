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
        if (mainScene.fenceManager && mainScene.fenceManager.fenceGroup) {
            this.scene.physics.add.collider(this.zombieGroup, mainScene.fenceManager.fenceGroup);
        }

        this.initWaveConfigs();
    }

    private initWaveConfigs() {
        this.waveConfigs = [
            { waveNumber: 1, totalZombies: 5, spawnIntervalMs: 2000, runnerRatio: 0.0, bruteCount: 0 },
            { waveNumber: 2, totalZombies: 8, spawnIntervalMs: 1800, runnerRatio: 0.2, bruteCount: 0 },
            { waveNumber: 3, totalZombies: 12, spawnIntervalMs: 1500, runnerRatio: 0.3, bruteCount: 1 },
            { waveNumber: 4, totalZombies: 18, spawnIntervalMs: 1200, runnerRatio: 0.4, bruteCount: 2 },
            { waveNumber: 5, totalZombies: 25, spawnIntervalMs: 1000, runnerRatio: 0.5, bruteCount: 3, bossType: "TITAN" },
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

        const config = this.waveConfigs.find(w => w.waveNumber === this.currentWave) || {
            waveNumber: this.currentWave,
            totalZombies: 10 + (this.currentWave * 4),
            spawnIntervalMs: Math.max(500, 2000 - (this.currentWave * 100)),
            runnerRatio: Math.min(0.8, 0.1 * this.currentWave),
            bruteCount: Math.floor(this.currentWave / 2)
        };

        this.totalZombiesInWave = config.totalZombies;
        this.zombiesSpawnedCount = 0;

        this.zombiesSpawnedCount++;
        this.spawnOffScreenZombie(playerX, playerY);

        if (config.totalZombies > 1) {
            this.spawnTimerEvent = this.scene.time.addEvent({
                delay: config.spawnIntervalMs,
                repeat: config.totalZombies - 2,
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

        const zombie = new Zombie(this.scene, spawnX, spawnY);
        this.zombieGroup.add(zombie);
    }

    public updateWaves(playerX: number, playerY: number, fenceManager: FenceManager) {
        if (!this.isWaveActive) return;

        const activeZombies = this.getActiveZombies();

        activeZombies.forEach((zombie) => {
            const fence = fenceManager.getFenceAtWorldPos(zombie.x, zombie.y);

            if (fence && fence.state === "INTACT") {
                zombie.setVelocity(0, 0);
                fenceManager.damageFence(fence.gridX, fence.gridY, 0.5);
            } else {
                zombie.update(playerX, playerY);
            }
        });

        if (this.zombiesSpawnedCount >= this.totalZombiesInWave && activeZombies.length === 0) {
            this.isWaveActive = false;
            this.wasWaveDefeated = false;
            if (this.spawnTimerEvent) this.spawnTimerEvent.remove();
        }
    }

    // Called on Surrender: Rewinds currentWave by 1 so startNextWave() retries the EXACT failed wave!
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