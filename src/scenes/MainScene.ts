import Phaser from "phaser";
import Player from "../player/Player";
import WorldGenerator from "../world/WorldGenerator";
import Zombie from "../enemies/Zombie";
import Backpack from "../systems/Backpack.ts";
import FarmPlot, { CropState } from "../world/FarmPlot.ts";
import HerbPlot, { HerbState } from "../world/HerbPlot.ts";
import CraftingBench from "../world/CraftingBench.ts";
import Scarecrow from "../world/Scarecrow.ts";
import SeedProjectile from "../weapons/SeedProjectile.ts";
import WaveManager from "../systems/WaveManager.ts";
import { FenceManager } from "../world/Fence.ts";
import { AdManager } from "../systems/AdManager.ts";
import DebugManager from "../utils/DebugManager.ts";

export default class MainScene extends Phaser.Scene {
    public player!: Player;
    public world!: WorldGenerator;
    public backpack!: Backpack;
    
    private farmPlots: FarmPlot[] = [];
    private herbPlots: HerbPlot[] = [];
    private scarecrow!: Scarecrow;
    private craftingBench!: CraftingBench;
    public fenceManager!: FenceManager;
    private waveManager!: WaveManager;
    private waveText!: Phaser.GameObjects.Text;

    private interactKey!: Phaser.Input.Keyboard.Key;
    private upgradeKey!: Phaser.Input.Keyboard.Key;
    private fenceModeKey!: Phaser.Input.Keyboard.Key;
    private healKey!: Phaser.Input.Keyboard.Key;
    private projectiles: SeedProjectile[] = [];

    public isPlacingFence: boolean = false;
    private fenceGhost!: Phaser.GameObjects.Rectangle;
    private deathModalGroup: Phaser.GameObjects.GameObject[] = [];

    constructor() {
        super("MainScene");
    }

    preload() {
        this.load.tilemapTiledJSON("map", "assets/maps/world.tmj");

        this.load.image("grass_tile", "assets/tiles/grass_tile.png");
        this.load.image("dirt_tile", "assets/tiles/dirt_tile.png");
        this.load.image("plowed_dirt", "assets/tiles/plowed_dirt.png");
        this.load.image("tree_bottom", "assets/tiles/tree_bottom.png");
        this.load.image("tree_top", "assets/tiles/tree_top.png");
        this.load.image("rock", "assets/tiles/rock.png");
        this.load.image("bush", "assets/tiles/bush.png");
        this.load.image("stump", "assets/tiles/stump.png");

        this.load.spritesheet("player", "assets/player/Player.png", {
            frameWidth: 32,
            frameHeight: 32
        });
    }

    create() {
        AdManager.getInstance().init(this.game);

        this.input.mouse?.disableContextMenu();
        if (this.game.canvas) {
            this.game.canvas.oncontextmenu = (e) => e.preventDefault();
        }

        this.world = new WorldGenerator(this);
        const map = this.world.generate();

        const spawnObj = map.findObject("objects", (obj) => obj.name === "PlayerSpawn");
        const spawnX = spawnObj?.x ?? (map.widthInPixels / 2);
        const spawnY = spawnObj?.y ?? (map.heightInPixels / 2);

        this.player = new Player(this, spawnX, spawnY);
        this.backpack = new Backpack(this);

        this.fenceManager = new FenceManager(this);
        this.waveManager = new WaveManager(this);

        // --- 1. SPAWN 3x3 FARM GRID ---
        const gridCenterX = spawnX + 120;
        const gridCenterY = spawnY;
        const spacing = 40;

        for (let row = -1; row <= 1; row++) {
            for (let col = -1; col <= 1; col++) {
                const posX = gridCenterX + (col * spacing);
                const posY = gridCenterY + (row * spacing);

                if (row === 0 && col === 0) {
                    this.scarecrow = new Scarecrow(this, posX, posY);
                } else {
                    const plot = new FarmPlot(this, posX, posY);
                    if (this.farmPlots.length >= 3) {
                        plot.isUnlocked = false;
                        plot.setTint(0x443322);
                    }
                    this.farmPlots.push(plot);
                }
            }
        }

        // --- 2. SPAWN 3 DEDICATED HERB PLOTS ---
        const herbStartX = spawnX - 100;
        const herbStartY = spawnY;
        for (let i = 0; i < 3; i++) {
            const isUnlocked = i === 0;
            const hPlot = new HerbPlot(this, herbStartX, herbStartY + (i * 40), isUnlocked);
            this.herbPlots.push(hPlot);
        }

        // --- 3. SPAWN CRAFTING BENCH ---
        this.craftingBench = new CraftingBench(this, gridCenterX, gridCenterY + 80);

        // --- 4. GHOST PREVIEW FOR FENCE PLACEMENT ---
        this.fenceGhost = this.add.rectangle(0, 0, 36, 36, 0x55ff55, 0.4);
        this.fenceGhost.setStrokeStyle(2, 0x00ff00);
        this.fenceGhost.setDepth(25000).setVisible(false);

        // --- 5. MOUSE CLICKS IN BUILD MODE (Left-Click = Place, Right-Click = Remove) ---
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (this.isPlacingFence) {
                if (pointer.button === 0 || pointer.leftButtonDown()) {
                    this.placeFenceAtGhostCursor(pointer.worldX, pointer.worldY);
                } else if (pointer.button === 2 || pointer.rightButtonDown()) {
                    this.removeFenceAtGhostCursor(pointer.worldX, pointer.worldY);
                }
            }
        });

        // Register Keyboard Controls
        if (this.input.keyboard) {
            this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
            this.upgradeKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.U);
            this.fenceModeKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
            this.healKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H);
            
            const nKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
            nKey.on("down", () => {
                if (!this.waveManager.isWaveActive) {
                    this.waveManager.startNextWave(this.player.x, this.player.y);
                    this.showFloatingText(this.player.x, this.player.y - 40, `WAVE ${this.waveManager.currentWave} STARTED!`, "#ff3333");
                }
            });
        }

        // --- SOLID PHYSICS COLLIDERS FOR PLAYER ---
        if (this.world.treeBottomGroup) {
            this.physics.add.collider(this.player, this.world.treeBottomGroup);
        }
        if (this.fenceManager && this.fenceManager.fenceGroup) {
            this.physics.add.collider(this.player, this.fenceManager.fenceGroup); // SOLID FENCES FOR PLAYER!
        }

        new DebugManager(this, this.player, this.waveManager, this.backpack, this.farmPlots);

        this.cameras.main.startFollow(this.player);
        this.cameras.main.setZoom(1.25);
        this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

        // --- TOP-CENTER WAVE HUD BANNER (600, 100) ---
        this.waveText = this.add.text(600, 100, "WAVE 0 - PREP PHASE | Press [N] to Start Wave", {
            fontFamily: "Arial",
            fontSize: "13px",
            color: "#ffcc00",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30000);

        // --- TOP-RIGHT MINIMAP HUD ---
        const minimapSize = 130;
        const minimapX = this.cameras.main.width - minimapSize - 16;
        const minimapY = 16;

        const minimapCamera = this.cameras.add(minimapX, minimapY, minimapSize, minimapSize);
        minimapCamera.startFollow(this.player);
        minimapCamera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        minimapCamera.setZoom(0.04);
        minimapCamera.setBackgroundColor(0x1a331a);

        const minimapFrame = this.add.rectangle(
            minimapX + minimapSize / 2,
            minimapY + minimapSize / 2,
            minimapSize + 4,
            minimapSize + 4
        );
        minimapFrame.setStrokeStyle(3, 0xffffff);
        minimapFrame.setScrollFactor(0);
        minimapFrame.setDepth(20000);

        if (this.backpack) {
            minimapCamera.ignore(this.backpack.getUIElements());
            minimapCamera.ignore(this.waveText);
            minimapCamera.ignore(this.fenceGhost);
        }
    }

    public registerProjectile(projectile: SeedProjectile) {
        this.projectiles.push(projectile);
    }

    private placeFenceAtGhostCursor(worldX: number, worldY: number) {
        // Calculate snapped center coordinates
        const gridX = Math.floor(worldX / 40);
        const gridY = Math.floor(worldY / 40);
        const snappedX = gridX * 40 + 20;
        const snappedY = gridY * 40 + 20;

        // Block placing on top of farm plots or structures!
        if (this.isTileOccupiedByStructure(snappedX, snappedY)) {
            this.showFloatingText(snappedX, snappedY - 20, "Cannot build on Farm Plots!", "#ff5555");
            return;
        }

        if (this.backpack.fences <= 0) {
            this.showFloatingText(snappedX, snappedY - 20, "No Fences in Bag! Craft at Bench.", "#ff5555");
            return;
        }

        const success = this.fenceManager.placeFence(worldX, worldY, 1);
        if (success) {
            this.backpack.addFences(-1);
            this.showFloatingText(snappedX, snappedY - 20, "Fence Placed!", "#55ff55");
        }
    }

    private removeFenceAtGhostCursor(worldX: number, worldY: number) {
        const success = this.fenceManager.removeFence(worldX, worldY);
        if (success) {
            this.backpack.addFences(1); // Refunds +1 Fence to your Backpack!
            this.showFloatingText(worldX, worldY - 20, "Fence Removed! (+1 Fence)", "#ffaa00");
        }
    }

    private isTileOccupiedByStructure(worldX: number, worldY: number): boolean {
        const testRect = new Phaser.Geom.Rectangle(worldX - 16, worldY - 16, 32, 32);

        // 1. Check Pepper Plots
        for (const plot of this.farmPlots) {
            if (Phaser.Geom.Intersects.RectangleToRectangle(testRect, plot.getBounds())) {
                return true;
            }
        }

        // 2. Check Herb Plots
        for (const hPlot of this.herbPlots) {
            if (Phaser.Geom.Intersects.RectangleToRectangle(testRect, hPlot.getBounds())) {
                return true;
            }
        }

        // 3. Check Scarecrow Totem
        if (this.scarecrow && Phaser.Geom.Intersects.RectangleToRectangle(testRect, this.scarecrow.getBounds())) {
            return true;
        }

        // 4. Check Crafting Bench
        if (this.craftingBench && Phaser.Geom.Intersects.RectangleToRectangle(testRect, this.craftingBench.getBounds())) {
            return true;
        }

        return false;
    }

   private handleFenceBuildMode() {
        if (Phaser.Input.Keyboard.JustDown(this.fenceModeKey)) {
            this.isPlacingFence = !this.isPlacingFence;
            this.fenceGhost.setVisible(this.isPlacingFence);

            if (this.isPlacingFence) {
                this.showFloatingText(this.player.x, this.player.y - 30, "Build Mode: [L-Click] Place | [R-Click] Remove | [F] Exit", "#55ff55");
            } else {
                this.showFloatingText(this.player.x, this.player.y - 30, "Build Mode Exited", "#aaaaaa");
            }
        }

        if (this.isPlacingFence) {
            const pointer = this.input.activePointer;
            const targetX = pointer.worldX;
            const targetY = pointer.worldY;

            // Snap ghost cleanly to 40px micro-grid
            const gridX = Math.floor(targetX / 40);
            const gridY = Math.floor(targetY / 40);
            const snappedX = gridX * 40 + 20;
            const snappedY = gridY * 40 + 20;

            this.fenceGhost.setPosition(snappedX, snappedY);

            const hasFence = this.fenceManager.hasIntactFenceAt(gridX, gridY);
            const isBlockedByStructure = this.isTileOccupiedByStructure(snappedX, snappedY);

            if (hasFence) {
                this.fenceGhost.setFillStyle(0xffaa00, 0.4); // Orange ghost (Right-Click to Remove!)
            } else if (isBlockedByStructure) {
                this.fenceGhost.setFillStyle(0xff2222, 0.4); // Red ghost (Blocked by Plot / Structure!)
            } else {
                this.fenceGhost.setFillStyle(0x55ff55, 0.4); // Green ghost (Valid placement slot!)
            }
        }
    }

    public onPlayerDeath() {
        this.physics.world.pause();

        const windowX = 512;
        const windowY = 288;

        const modalBg = this.add.rectangle(windowX, windowY, 320, 200, 0x110000, 0.95);
        modalBg.setStrokeStyle(3, 0xff3333).setScrollFactor(0).setDepth(40000);

        const modalTitle = this.add.text(windowX, windowY - 70, "💀 YOU HAVE FALLEN", {
            fontFamily: "Arial",
            fontSize: "18px",
            color: "#ff3333",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(40001);

        const reviveBtn = this.add.rectangle(windowX, windowY - 15, 260, 36, 0x1a441a, 0.95);
        reviveBtn.setStrokeStyle(2, 0x55ff55).setScrollFactor(0).setDepth(40001).setInteractive({ useHandCursor: true });

        const reviveText = this.add.text(windowX, windowY - 15, "📺 Watch Ad: Revive with 50% HP", {
            fontFamily: "Arial",
            fontSize: "12px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 2
        }).setOrigin(0.5).setScrollFactor(0).setDepth(40002);

        reviveBtn.on("pointerdown", () => {
            this.clearDeathModal();
            AdManager.getInstance().playAd("rewarded", (success: boolean) => {
                if (success && this.player) {
                    this.player.hp = 50;
                    this.backpack.updateHP(50, this.player.maxHp);
                    this.player.clearTint();
                    this.showFloatingText(this.player.x, this.player.y - 40, "REVIVED WITH 50% HP!", "#55ff55");
                }
            });
        });

        const surrenderBtn = this.add.rectangle(windowX, windowY + 40, 260, 36, 0x331111, 0.95);
        surrenderBtn.setStrokeStyle(2, 0x888888).setScrollFactor(0).setDepth(40001).setInteractive({ useHandCursor: true });

        const surrenderText = this.add.text(windowX, windowY + 40, "💀 Accept Defeat & Return", {
            fontFamily: "Arial",
            fontSize: "12px",
            color: "#aaaaaa",
            stroke: "#000000",
            strokeThickness: 2
        }).setOrigin(0.5).setScrollFactor(0).setDepth(40002);

        surrenderBtn.on("pointerdown", () => {
            this.clearDeathModal();
            this.resetToFarmAfterDefeat();
        });

        this.deathModalGroup = [modalBg, modalTitle, reviveBtn, reviveText, surrenderBtn, surrenderText];
    }

    private clearDeathModal() {
        this.deathModalGroup.forEach(obj => obj.destroy());
        this.deathModalGroup = [];
    }

    private resetToFarmAfterDefeat() {
        // Extraction Tax: 50% Biomass Loss
        // Minimum 1 Biomass Floor (Prevents total 0 bankruptcy on death)
this.backpack.biomassCount = Math.max(1, Math.floor(this.backpack.biomassCount / 2));
        this.player.hp = 100;
        this.backpack.updateHP(100, this.player.maxHp);
        this.player.clearTint();

        const spawnObj = this.world.map.findObject("objects", (obj) => obj.name === "PlayerSpawn");
        this.player.setPosition(spawnObj?.x ?? 1600, spawnObj?.y ?? 1600);

        // REWIND TO PREP PHASE OF CURRENT DEFEATED WAVE
        if (this.waveManager) {
            this.waveManager.onWaveFailed();
        }

        this.physics.world.resume();
        this.showFloatingText(this.player.x, this.player.y - 40, "Extraction Tax Applied (-50% Biomass)", "#ffaa00");
    }

    private getNextPlotUnlockCost(): number {
        const unlockedCount = this.farmPlots.filter(p => p.isUnlocked).length;
        const costs = [3, 5, 8, 12, 15];
        const index = Math.min(costs.length - 1, unlockedCount - 3);
        return costs[Math.max(0, index)];
    }

    update(time: number, delta: number) {
        if (this.player && this.player.active) {
            this.player.setDepth(this.player.y);
            this.player.update(delta);
        }

        this.checkLootPickup();
        this.handleFenceBuildMode();
        this.handleHealHotkey();

        this.farmPlots.forEach(plot => plot.updatePlot(delta));
        this.herbPlots.forEach(hPlot => hPlot.updateHerbPlot(delta));

        this.updateSingleClosestPrompt();
        this.handleFarmingInteraction();

        if (this.waveManager) {
            this.waveManager.updateWaves(this.player.x, this.player.y, this.fenceManager);

            const activeZombies = this.waveManager.getActiveZombies();
            activeZombies.forEach(z => z.setDepth(z.y));

            const remaining = this.waveManager.getRemainingZombieCount();

            if (this.waveManager.isWaveActive) {
                this.waveText.setText(`WAVE ${this.waveManager.currentWave} IN PROGRESS | Zombies Remaining: ${remaining}`);
                this.waveText.setColor("#ff3333");
            } else if (this.waveManager.wasWaveDefeated) {
                // Displays Retry Banner for the exact failed wave!
                const retryWave = this.waveManager.currentWave + 1;
                this.waveText.setText(`WAVE ${retryWave} FAILED - PREP PHASE | Press [N] to Retry Wave ${retryWave}`);
                this.waveText.setColor("#ffaa00");
            } else if (this.waveManager.currentWave > 0) {
                this.waveText.setText(`WAVE ${this.waveManager.currentWave} CLEARED - PREP PHASE | Press [N] to Start Wave ${this.waveManager.currentWave + 1}`);
                this.waveText.setColor("#55ff55");
            }

            if (activeZombies.length > 0) {
                this.projectiles.forEach((proj) => {
                    if (proj.active) {
                        const projBounds = proj.getBounds();
                        activeZombies.forEach((zombie) => {
                            if (proj.active && Phaser.Geom.Intersects.RectangleToRectangle(projBounds, zombie.getBounds())) {
                                proj.onHitZombie(zombie);
                            }
                        });
                    }
                });

                this.checkWeaponHit(activeZombies);
            }
        }
    }

    private handleHealHotkey() {
        if (Phaser.Input.Keyboard.JustDown(this.healKey)) {
            if (this.backpack.healHerbs > 0 && this.player.hp < this.player.maxHp) {
                this.backpack.addHealHerbs(-1);
                this.player.heal(25);
                this.showFloatingText(this.player.x, this.player.y - 40, "+25 HP Healed!", "#55ff55");
            } else if (this.backpack.healHerbs <= 0) {
                this.showFloatingText(this.player.x, this.player.y - 40, "No Heal Herbs in Backpack!", "#ff5555");
            } else if (this.player.hp >= this.player.maxHp) {
                this.showFloatingText(this.player.x, this.player.y - 40, "HP Already Full!", "#ffff55");
            }
        }
    }

    private updateSingleClosestPrompt() {
        this.farmPlots.forEach(p => p.hidePrompt());
        this.herbPlots.forEach(hp => hp.hidePrompt());
        if (this.scarecrow) this.scarecrow.hidePrompt();
        if (this.craftingBench) this.craftingBench.hidePrompt();
        if (this.fenceManager) this.fenceManager.hidePrompt();

        if (!this.player || !this.player.body || this.isPlacingFence) return;

        const isWaveActive = this.waveManager ? this.waveManager.isWaveActive : false;

        // 1. Broken Fence Ruins Prompt
        if (this.fenceManager && this.fenceManager.hasNearbyBrokenRuins(this.player.x, this.player.y)) {
            this.fenceManager.showRuinsPrompt(this.player.x, this.player.y, this.backpack.biomassCount, isWaveActive);
            return;
        }

        const feetX = this.player.x;
        const feetY = this.player.y - 8;
        const reach = 28;

        // 2. Crafting Bench
        if (this.craftingBench && Phaser.Math.Distance.Between(feetX, feetY, this.craftingBench.x, this.craftingBench.y) <= reach) {
            this.craftingBench.showPrompt(this.backpack.biomassCount, isWaveActive);
            return;
        }

        // 3. Scarecrow
        if (this.scarecrow && Phaser.Math.Distance.Between(feetX, feetY, this.scarecrow.x, this.scarecrow.y) <= reach) {
            this.scarecrow.showPrompt();
            return;
        }

        // 4. Soil Pepper Plots
        for (const plot of this.farmPlots) {
            if (Phaser.Math.Distance.Between(feetX, feetY, plot.x, plot.y) <= reach) {
                const cost = this.getNextPlotUnlockCost();
                plot.showPrompt(this.backpack.biomassCount, this.backpack.pepperSeeds, cost);
                return;
            }
        }

        // 5. Herb Plots
        for (const hPlot of this.herbPlots) {
            if (Phaser.Math.Distance.Between(feetX, feetY, hPlot.x, hPlot.y) <= reach) {
                hPlot.showPrompt(this.backpack.biomassCount, isWaveActive);
                return;
            }
        }
    }

    private handleFarmingInteraction() {
        if (!this.player || !this.player.body || this.isPlacingFence) return;

        const isEJustDown = Phaser.Input.Keyboard.JustDown(this.interactKey);
        const isUJustDown = Phaser.Input.Keyboard.JustDown(this.upgradeKey);

        if (!isEJustDown && !isUJustDown) return;

        if (this.waveManager && this.waveManager.isWaveActive) {
            this.showFloatingText(this.player.x, this.player.y - 40, "Farming Locked During Active Wave!", "#ff3333");
            return;
        }

        const feetX = this.player.x;
        const feetY = this.player.y - 8;
        const reach = 28;

        // Rebuild Broken Ruins (E Key)
        if (isEJustDown && this.fenceManager.hasNearbyBrokenRuins(this.player.x, this.player.y)) {
            const rebuilt = this.fenceManager.rebuildNearbyBrokenFences(this.player.x, this.player.y, this.backpack);
            if (rebuilt > 0) {
                this.showFloatingText(this.player.x, this.player.y - 30, `Rebuilt +${rebuilt} Fences! (-1 Biomass)`, "#55ff55");
                return;
            }
        }

        // Craft Fence at Bench (E Key)
        if (this.craftingBench && Phaser.Math.Distance.Between(feetX, feetY, this.craftingBench.x, this.craftingBench.y) <= reach) {
            if (isEJustDown) {
                const success = this.craftingBench.craftFence(this.backpack);
                if (success) {
                    this.showFloatingText(this.craftingBench.x, this.craftingBench.y - 30, "+1 Fence Crafted! [Press F to Place]", "#55ff55");
                } else {
                    this.showFloatingText(this.craftingBench.x, this.craftingBench.y - 30, "Need 2 Biomass to Craft Fence!", "#ff5555");
                }
            }
            return;
        }

        // Scarecrow Totem
        if (this.scarecrow && Phaser.Math.Distance.Between(feetX, feetY, this.scarecrow.x, this.scarecrow.y) <= reach) {
            if (isEJustDown) {
                const yieldData = this.scarecrow.vacuumHarvestAll(this.farmPlots, this.backpack, this);
                if (yieldData.totalAmmo > 0 || yieldData.totalSeeds > 0) {
                    this.showFloatingText(
                        this.scarecrow.x, 
                        this.scarecrow.y - 30, 
                        `+${yieldData.totalAmmo} Ammo | +${yieldData.totalSeeds} Seeds`, 
                        "#ffaa00"
                    );
                }
            }

            if (isUJustDown) {
                const success = this.scarecrow.upgradeTotem(this.backpack, this.farmPlots, this);
                if (success) {
                    this.showFloatingText(this.scarecrow.x, this.scarecrow.y - 30, `Totem & Soil Upgraded to Lvl ${this.scarecrow.level}!`, "#55ff55");
                } else if (this.backpack.biomassCount < 10) {
                    this.showFloatingText(this.scarecrow.x, this.scarecrow.y - 30, "Need 10 Biomass to Upgrade!", "#ff5555");
                }
            }
            return;
        }

        // Herb Plots
        for (const hPlot of this.herbPlots) {
            if (Phaser.Math.Distance.Between(feetX, feetY, hPlot.x, hPlot.y) <= reach) {
                if (isEJustDown) {
                    if (!hPlot.isUnlocked && this.backpack.biomassCount >= 3) {
                        this.backpack.addBiomass(-3);
                        hPlot.unlockHerbPlot();
                        this.showFloatingText(hPlot.x, hPlot.y - 30, "Herb Plot Unlocked!", "#55ff55");
                    } else if (hPlot.isUnlocked && hPlot.state === HerbState.EMPTY && this.backpack.biomassCount > 0) {
                        this.backpack.addBiomass(-1);
                        hPlot.plantHerb();
                        this.showFloatingText(hPlot.x, hPlot.y - 30, "Heal Herb Planted!", "#55ff55");
                    } else if (hPlot.isUnlocked && hPlot.state === HerbState.MATURE) {
                        const harvested = hPlot.harvestHerb();
                        if (harvested) {
                            this.backpack.addHealHerbs(1);
                            this.showFloatingText(hPlot.x, hPlot.y - 30, "+1 Heal Herb (Press H to Heal!)", "#00ff66");
                        }
                    }
                }
                return;
            }
        }

        // Pepper Plots
        if (isEJustDown) {
            for (const plot of this.farmPlots) {
                if (Phaser.Math.Distance.Between(feetX, feetY, plot.x, plot.y) <= reach) {
                    const unlockCost = this.getNextPlotUnlockCost();

                    if (!plot.isUnlocked && this.backpack.biomassCount >= unlockCost) {
                        this.backpack.addBiomass(-unlockCost);
                        plot.unlockPlot();
                        this.showFloatingText(plot.x, plot.y - 30, `Plot Unlocked! (-${unlockCost} Biomass)`, "#55ff55");
                    } else if (plot.isUnlocked && plot.fertility <= 0 && this.backpack.biomassCount > 0) {
                        this.backpack.addBiomass(-1);
                        plot.fertilizeSoil();
                        this.showFloatingText(plot.x, plot.y - 30, "Soil Fertilized! (+100%)", "#55ff55");
                    } else if (plot.isUnlocked && plot.state === CropState.EMPTY && plot.fertility > 0 && this.backpack.pepperSeeds > 0) {
                        this.backpack.addPepperSeeds(-1);
                        plot.plantSeed("pepper");
                        this.showFloatingText(plot.x, plot.y - 30, "Pepper Planted!", "#55ff55");
                    } else if (plot.isUnlocked && plot.state === CropState.MATURE) {
                        const yieldData = plot.harvest();
                        if (yieldData) {
                            this.backpack.addPepperAmmo(yieldData.ammo);
                            this.backpack.addPepperSeeds(yieldData.seeds);
                            this.showFloatingText(plot.x, plot.y - 30, `+${yieldData.ammo} Pepper Ammo | +${yieldData.seeds} Seeds`, "#ffaa00");
                        }
                    }
                    break;
                }
            }
        }
    }

    private checkWeaponHit(activeZombies: Zombie[]) {
        const children = this.children.getChildren();
        children.forEach((child) => {
            if (child instanceof Phaser.GameObjects.Rectangle && child.body) {
                const weaponBounds = child.getBounds();

                activeZombies.forEach((zombie) => {
                    const zombieBounds = zombie.getBounds();

                    if (!child.getData("hasHit") && Phaser.Geom.Intersects.RectangleToRectangle(weaponBounds, zombieBounds)) {
                        child.setData("hasHit", true);

                        const knockbackDir = new Phaser.Math.Vector2(
                            zombie.x - this.player.x,
                            zombie.y - this.player.y
                        ).normalize();

                        this.triggerHitStop(50);
                        this.cameras.main.shake(80, 0.005);

                        zombie.takeDamage(
                            this.player.weapon.damage,
                            knockbackDir,
                            this.player.weapon.knockbackForce,
                            "MELEE"
                        );
                    }
                });
            }
        });
    }

    private triggerHitStop(durationMs: number) {
        this.physics.world.pause();
        this.time.delayedCall(durationMs, () => {
            this.physics.world.resume();
        });
    }

    private checkLootPickup() {
        const children = this.children.getChildren();
        children.forEach((child) => {
            if (child.getData("type") === "biomass") {
                if (this.physics.overlap(this.player, child)) {
                    const amount = child.getData("amount") || 1;
                    this.backpack.addBiomass(amount);
                    
                    const popup = this.add.text(this.player.x, this.player.y - 16, "+1 Biomass", {
                        fontFamily: "Arial",
                        fontSize: "12px",
                        color: "#55ff55",
                        stroke: "#000000",
                        strokeThickness: 3
                    })
                    .setOrigin(0.5)
                    .setDepth(20000);

                    this.tweens.add({
                        targets: popup,
                        y: popup.y - 15,
                        alpha: 0,
                        duration: 500,
                        onComplete: () => popup.destroy()
                    });

                    child.destroy();
                }
            }
        });
    }

    private showFloatingText(x: number, y: number, text: string, color: string) {
        const popup = this.add.text(x, y, text, {
            fontFamily: "Arial",
            fontSize: "14px",
            color: color,
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(20000);

        this.tweens.add({
            targets: popup,
            y: popup.y - 20,
            alpha: 0,
            duration: 800,
            onComplete: () => popup.destroy()
        });
    }
}