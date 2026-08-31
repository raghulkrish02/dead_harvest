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
import SeedComposter from "../world/SeedComposter.ts";
import Minimap from "../ui/Minimap.ts";

export default class MainScene extends Phaser.Scene {
    public player!: Player;
    public world!: WorldGenerator;
    public backpack!: Backpack;
    private minimap!: Minimap;
    
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
    private rootBurstKey!: Phaser.Input.Keyboard.Key;
    private projectiles: SeedProjectile[] = [];

    public isPlacingFence: boolean = false;
    private fenceGhost!: Phaser.GameObjects.Rectangle;
    private deathModalGroup: Phaser.GameObjects.GameObject[] = [];

    private seedComposter!: SeedComposter;
    private lastRootBurstTime: number = 0;

    public meleeHitbox!: Phaser.Physics.Arcade.Sprite;

    // 👑 Boss Bar UI Elements
    private bossBarGroup: Phaser.GameObjects.GameObject[] = [];
    private bossBarFill!: Phaser.GameObjects.Rectangle;
    private bossBarText!: Phaser.GameObjects.Text;
    private bossArmorStatusText!: Phaser.GameObjects.Text;
    private act1VictoryModalGroup: Phaser.GameObjects.GameObject[] = [];

     // 📋 Wave 5 Boss Intel HUD Elements
    private bossIntelGroup: Phaser.GameObjects.GameObject[] = [];
    private bossIntelText!: Phaser.GameObjects.Text;
    private hasWarnedUnderEquipped: boolean = false;

    // 📦 Emergency Airdrop UI
    private airdropBtn!: Phaser.GameObjects.Rectangle;
    private airdropText!: Phaser.GameObjects.Text;
    private hasClaimedAirdropThisWave: boolean = false;

    // ☀️ DYNAMIC ATMOSPHERE OVERLAYS
    private nightOverlay!: Phaser.GameObjects.Rectangle;
    private isNightActive: boolean = false;

    constructor() {
        super("MainScene");
    }

    preload() {
        this.load.tilemapTiledJSON("map", "assets/maps/world.tmj");

        this.load.image("grass_tile", "assets/tiles/grass_tile.png");
        this.load.image("dirt_tile", "assets/tiles/dirt_tile.png");
        this.load.image("plowed_dirt", "assets/tiles/plowed_dirt.png");
        this.load.image("tree", "assets/tiles/tree.png"); // Single unified tree asset!
        this.load.image("rock", "assets/tiles/rock.png");
        this.load.image("bush", "assets/tiles/bush.png");
        this.load.image("stump", "assets/tiles/trunk.png");

        // --- CLEAN PLAYER SPRITES (128x128 Standard) ---
        this.load.image("player_idle", "assets/player/player_idle.png");
        this.load.spritesheet("player_side", "assets/player/player_side.png", {
            frameWidth: 192,  // 👈 Change to 192
            frameHeight: 192 // 👈 Change to 192
        });

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

        // 📦 Emergency Airdrop Button (Docked above Backpack button at 630, 550)
        const airdropX = 630;
        const airdropY = 550;

        this.airdropBtn = this.add.rectangle(airdropX, airdropY, 180, 32, 0x332211, 0.95);
        this.airdropBtn.setStrokeStyle(2, 0xffaa00).setScrollFactor(0).setDepth(29999).setVisible(false);
        this.airdropBtn.setInteractive({ useHandCursor: true });

        this.airdropText = this.add.text(airdropX, airdropY, "📦 Airdrop: +3 Biomass", {
            fontFamily: "Arial",
            fontSize: "11px",
            color: "#ffaa00",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30000).setVisible(false);

        this.airdropBtn.on("pointerdown", () => {
            const cooldown = AdManager.getInstance().getRemainingCooldownSeconds();
            if (cooldown > 0) {
                this.showFloatingText(this.player.x, this.player.y - 90, `⚠️ Airdrop on Cooldown! Available in ${cooldown}s`, "#ffaa00", 2500);
                return;
            }

            AdManager.getInstance().playAd("rewarded", (success: boolean) => {
                if (success && this.backpack) {
                    this.hasClaimedAirdropThisWave = true;
                    this.backpack.addBiomass(3);
                    this.backpack.addPepperSeeds(2);
                    this.showFloatingText(this.player.x, this.player.y - 90, "📦 AIRDROP DELIVERED! (+3 Biomass & +2 Seeds)", "#55ff55", 3500);
                }
            });
        });


        this.fenceManager = new FenceManager(this);
        this.waveManager = new WaveManager(this);

        // --- 1. SPAWN RUSTIC FARMSTEAD CLEARING & 3x3 FARM GRID ---
        const gridCenterX = spawnX + 120;
        const gridCenterY = spawnY;
        const spacing = 40;

        // 🌾 RUSTIC FARMSTEAD DIRT CLEARING (Underneath farm plots)
        this.farmDirtClearing = this.add.ellipse(gridCenterX, gridCenterY + 20, 320, 260, 0x3d2714, 0.88);
        this.farmDirtClearing.setDepth(0);
        this.farmDirtClearing.setStrokeStyle(4, 0x2b1a0c, 0.6);

        // Spawn 3x3 Plots & Scarecrow
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

        // --- 3. SPAWN CRAFTING BENCH & SEED COMPOSTER ---
        this.craftingBench = new CraftingBench(this, gridCenterX - 25, gridCenterY + 80);
        this.seedComposter = new SeedComposter(this, gridCenterX + 25, gridCenterY + 80);

        // Register Keyboard Controls
        if (this.input.keyboard) {
            this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
            this.upgradeKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.U);
            this.fenceModeKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
            this.healKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H);
            this.rootBurstKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);

            this.rootBurstKey.on("down", () => this.triggerRootBurst());
            
            const nKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
            nKey.on("down", () => {
                if (!this.waveManager.isWaveActive) {
                    const isStartingWave5 = (this.waveManager.currentWave === 4) || (this.waveManager.currentWave === 5 && this.waveManager.wasWaveDefeated);

                    // ⚠️ Warning check on first press if under-equipped for Boss
                    if (isStartingWave5 && this.scarecrow.level < 2 && !this.hasWarnedUnderEquipped) {
                        this.hasWarnedUnderEquipped = true;
                        this.showFloatingText(
                            this.player.x, 
                            this.player.y - 90, 
                            "⚠️ WARNING: Totem Lvl 1! (Need 2 'Q' Charges to crack Boss Armor!) Press [N] again to start.", 
                            "#ffcc00", 
                            4000
                        );
                        return;
                    }

                    this.hasWarnedUnderEquipped = false;
                    this.waveManager.startNextWave(this.player.x, this.player.y);
                    this.setNightLighting(true); // 🌙 Turn on Night!
                    this.showFloatingText(this.player.x, this.player.y - 90, `WAVE ${this.waveManager.currentWave} STARTED!`, "#ff3333");
                }
            });
        }

        // 🚀 4. PRE-ALLOCATED PROJECTILE POOL (Zero GC Allocations!)
        this.projectileGroup = this.physics.add.group({
            classType: SeedProjectile,
            runChildUpdate: false,
            maxSize: 60
        });

        for (let i = 0; i < 30; i++) {
            const p = new SeedProjectile(this, 0, 0);
            this.projectileGroup.add(p);
        }

        // Bullets collide with Solid Tree Base (treeBottomGroup)
        if (this.world?.treeBottomGroup) {
            this.physics.add.overlap(
                this.projectileGroup,
                this.world.treeBottomGroup,
                (projObj) => {
                    const proj = projObj as SeedProjectile;
                    if (proj?.active) {
                        proj.onHitObstacle("TREE");
                    }
                }
            );
        }

        // Bullets collide with Solid Rocks
        if (this.world?.rockGroup) {
            this.physics.add.overlap(
                this.projectileGroup,
                this.world.rockGroup,
                (projObj) => {
                    const proj = projObj as SeedProjectile;
                    if (proj?.active) {
                        proj.onHitObstacle("ROCK");
                    }
                }
            );
        }

        // ⚔️ 5. NATIVE ZERO-LAG MELEE HITBOX & OVERLAP
        this.meleeHitbox = this.physics.add.sprite(0, 0, "player", 0);
        this.meleeHitbox.setVisible(false).setActive(false);
        this.meleeHitbox.body!.enable = false;

        if (this.waveManager && this.waveManager.zombieGroup) {
            this.physics.add.overlap(
                this.meleeHitbox,
                this.waveManager.zombieGroup,
                (hitboxObj, zombieObj) => {
                    const zombie = zombieObj as Zombie;
                    if (zombie && zombie.active && !zombie.getData("hitByCurrentMelee")) {
                        zombie.setData("hitByCurrentMelee", true);

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
                }
            );
        }

        // --- 6. GHOST PREVIEW FOR FENCE PLACEMENT ---
        this.fenceGhost = this.add.rectangle(0, 0, 36, 36, 0x55ff55, 0.4);
        this.fenceGhost.setStrokeStyle(2, 0x00ff00);
        this.fenceGhost.setDepth(25000).setVisible(false);

        // --- 7. MOUSE CLICKS IN BUILD MODE ---
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (this.isPlacingFence) {
                if (pointer.button === 0 || pointer.leftButtonDown()) {
                    this.placeFenceAtGhostCursor(pointer.worldX, pointer.worldY);
                } else if (pointer.button === 2 || pointer.rightButtonDown()) {
                    this.removeFenceAtGhostCursor(pointer.worldX, pointer.worldY);
                }
            }
        });

        // --- SOLID PHYSICS COLLIDERS ---
        if (this.world.treeBottomGroup) {
            this.physics.add.collider(this.player, this.world.treeBottomGroup);
        }
        if (this.world.rockGroup) {
            this.physics.add.collider(this.player, this.world.rockGroup);
        }
        if (this.fenceManager && this.fenceManager.fenceGroup) {
            this.physics.add.collider(this.player, this.fenceManager.fenceGroup);
        }

         // 👑 Top-Center Boss Health Bar (Zoom-Calibrated: 100% visible below Wave Banner!)
        const bossBarX = 600;
        const bossBarY = 135; // Calibrated directly below the Wave Banner at y = 100!

        const bossBg = this.add.rectangle(bossBarX, bossBarY, 320, 22, 0x110000, 0.9);
        bossBg.setStrokeStyle(2, 0xff3333).setScrollFactor(0).setDepth(30000).setVisible(false);

        this.bossBarFill = this.add.rectangle(bossBarX - 156, bossBarY, 312, 16, 0xcc2222);
        this.bossBarFill.setOrigin(0, 0.5).setScrollFactor(0).setDepth(30001).setVisible(false);

        this.bossBarText = this.add.text(bossBarX, bossBarY, "👑 THE ROTTING TITAN: 450 / 450", {
            fontFamily: "Arial",
            fontSize: "11px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30002).setVisible(false);

        this.bossArmorStatusText = this.add.text(bossBarX, bossBarY + 18, "🛡️ BARK ARMORED (50% DEF)", {
            fontFamily: "Arial",
            fontSize: "10px",
            color: "#ffaa00",
            stroke: "#000000",
            strokeThickness: 2
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30002).setVisible(false);

        this.bossBarGroup = [bossBg, this.bossBarFill, this.bossBarText, this.bossArmorStatusText];

        // 📋 Wave 5 Boss Intel & Readiness Checklist Panel (Hidden by default)
        const intelX = 600;
        const intelY = 195;

        const intelBg = this.add.rectangle(intelX, intelY, 340, 75, 0x0a140a, 0.9);
        intelBg.setStrokeStyle(1.5, 0xffcc00).setScrollFactor(0).setDepth(25000).setVisible(false);

        const intelTitle = this.add.text(intelX, intelY - 26, "⚠️ WAVE 5 INTEL: BOSS READINESS", {
            fontFamily: "Arial",
            fontSize: "10px",
            color: "#ffcc00",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(25001).setVisible(false);

        this.bossIntelText = this.add.text(intelX - 155, intelY - 12, "", {
            fontFamily: "Arial",
            fontSize: "10px",
            color: "#ffffff",
            lineSpacing: 4,
            stroke: "#000000",
            strokeThickness: 2
        }).setScrollFactor(0).setDepth(25001).setVisible(false);

        this.bossIntelGroup = [intelBg, intelTitle, this.bossIntelText];


        new DebugManager(this, this.player, this.waveManager, this.backpack, this.farmPlots);

        this.cameras.main.startFollow(this.player);
        this.cameras.main.setZoom(1.25);
        this.cameras.main.roundPixels = true; // 👈 STOPS subpixel camera vibration!
        this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

        // 🌑 Atmospheric Camera Vignette (Soft shadow falloff on screen edges)
        if (this.cameras.main.postFX) {
            this.cameras.main.postFX.addVignette(0.5, 0.5, 0.82, 0.45);
        }

        // Top-Center Wave Banner
        this.waveText = this.add.text(600, 100, "WAVE 0 - PREP PHASE | Press [N] to Start Wave", {
            fontFamily: "Arial",
            fontSize: "13px",
            color: "#ffcc00",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30000);

        // 🗺️ Ultra-Fast 60 FPS Radar Minimap
        this.minimap = new Minimap(this);

        // 🎨 Smooth Linear Filtering for High-Res Vector Art (Zero Jagged Edges!)
        if (this.textures.exists("player_idle")) {
            this.textures.get("player_idle").setFilter(Phaser.Textures.FilterMode.LINEAR);
        }
        if (this.textures.exists("player_side")) {
            this.textures.get("player_side").setFilter(Phaser.Textures.FilterMode.LINEAR);
        }


       // 🌙 VIEWPORT-LOCKED NIGHT OVERLAY (Covers 100% of camera viewport at Depth 25)
        const screenW = this.scale.width * 2;
        const screenH = this.scale.height * 2;

        // 🌙 SCREEN-LOCKED NIGHT OVERLAY (Depth 20,000: Above world, below blood & UI!)
        this.nightOverlay = this.add.rectangle(
            0,
            0,
            this.scale.width * 2,
            this.scale.height * 2,
            0x040814, // Deep Midnight Navy
            1
        ).setOrigin(0, 0).setScrollFactor(0).setDepth(20000).setAlpha(0); // 👈 Starts at alpha 0
        // Minimap HUD Camera
        /**const minimapSize = 130;
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
        }**/
    }

    public triggerMeleeSwing(playerX: number, chestY: number, pointer: Phaser.Input.Pointer) {
        const angle = Phaser.Math.Angle.Between(playerX, chestY, pointer.worldX, pointer.worldY);
        const reach = 32;
        const hitX = playerX + Math.cos(angle) * reach;
        const hitY = chestY + Math.sin(angle) * reach;

        // Reset hit flags on zombies for fresh swing
        if (this.waveManager) {
            this.waveManager.getActiveZombies().forEach(z => z.setData("hitByCurrentMelee", false));
        }

        this.meleeHitbox.setPosition(hitX, hitY);
        this.meleeHitbox.setSize(40, 24);
        (this.meleeHitbox.body as Phaser.Physics.Arcade.Body).enable = true;
        this.meleeHitbox.setActive(true);

        this.time.delayedCall(100, () => {
            if (this.meleeHitbox.body) {
                (this.meleeHitbox.body as Phaser.Physics.Arcade.Body).enable = false;
                this.meleeHitbox.setActive(false);
            }
        });
    }

    public registerProjectile(projectile: SeedProjectile) {
        this.projectiles.push(projectile);
    }

    private placeFenceAtGhostCursor(worldX: number, worldY: number) {
        const snappedX = Math.floor(worldX / 40) * 40 + 20;
        const snappedY = Math.floor(worldY / 40) * 40 + 20;

        if (this.isTileOccupiedByStructure(snappedX, snappedY)) {
            this.showFloatingText(snappedX, snappedY - 20, "Cannot build on Farm Plots!", "#ff5555");
            return;
        }

        const existingFence = this.fenceManager.getFenceAtWorldPos(worldX, worldY);
        if (existingFence) {
            if (existingFence.state === "BROKEN") {
                this.showFloatingText(snappedX, snappedY - 20, "Ruins present! Rebuild with [E] and Biomass", "#ffaa00");
            } else {
                this.showFloatingText(snappedX, snappedY - 20, "Fence already exists here!", "#ff5555");
            }
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
        const fenceData = this.fenceManager.getFenceAtWorldPos(worldX, worldY);
        if (fenceData && fenceData.state === "BROKEN") {
            this.showFloatingText(worldX, worldY - 20, "Ruins cannot be dismantled! Repair with [E]", "#ff5555");
            return;
        }

        const success = this.fenceManager.removeFence(worldX, worldY);
        if (success) {
            this.backpack.addFences(1);
            this.showFloatingText(worldX, worldY - 20, "Fence Removed! (+1 Fence)", "#ffaa00");
        }
    }

    private isTileOccupiedByStructure(worldX: number, worldY: number): boolean {
        const testRect = new Phaser.Geom.Rectangle(worldX - 16, worldY - 16, 32, 32);

        for (const plot of this.farmPlots) {
            if (Phaser.Geom.Intersects.RectangleToRectangle(testRect, plot.getBounds())) return true;
        }
        for (const hPlot of this.herbPlots) {
            if (Phaser.Geom.Intersects.RectangleToRectangle(testRect, hPlot.getBounds())) return true;
        }
        if (this.scarecrow && Phaser.Geom.Intersects.RectangleToRectangle(testRect, this.scarecrow.getBounds())) return true;
        if (this.craftingBench && Phaser.Geom.Intersects.RectangleToRectangle(testRect, this.craftingBench.getBounds())) return true;
        if (this.seedComposter && Phaser.Geom.Intersects.RectangleToRectangle(testRect, this.seedComposter.getBounds())) return true;

        return false;
    }

    private handleFenceBuildMode() {
        if (Phaser.Input.Keyboard.JustDown(this.fenceModeKey)) {
            this.isPlacingFence = !this.isPlacingFence;
            this.fenceGhost.setVisible(this.isPlacingFence);

            if (this.isPlacingFence) {
                this.showFloatingText(this.player.x, this.player.y - 90, "Build Mode: [L-Click] Place | [R-Click] Remove | [F] Exit", "#55ff55");
            } else {
                this.showFloatingText(this.player.x, this.player.y - 90, "Build Mode Exited", "#aaaaaa");
            }
        }

        if (this.isPlacingFence) {
            const pointer = this.input.activePointer;
            const targetX = pointer.worldX;
            const targetY = pointer.worldY;

            const gridX = Math.floor(targetX / 40);
            const gridY = Math.floor(targetY / 40);
            const snappedX = gridX * 40 + 20;
            const snappedY = gridY * 40 + 20;

            this.fenceGhost.setPosition(snappedX, snappedY);

            const existingFence = this.fenceManager.getFenceAtWorldPos(targetX, targetY);
            const isBlockedByStructure = this.isTileOccupiedByStructure(snappedX, snappedY);

            if (existingFence && existingFence.state === "INTACT") {
                this.fenceGhost.setFillStyle(0xffaa00, 0.4);
            } else if (existingFence && existingFence.state === "BROKEN") {
                this.fenceGhost.setFillStyle(0xcc2222, 0.5);
            } else if (isBlockedByStructure) {
                this.fenceGhost.setFillStyle(0xff2222, 0.4);
            } else {
                this.fenceGhost.setFillStyle(0x55ff55, 0.4);
            }
        }
    }

    public onPlayerDeath() {
        this.physics.world.pause();

        // 📐 Your exact window coordinates (512, 288) & 320x200 modal
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
            fontSize: "11px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 2
        }).setOrigin(0.5).setScrollFactor(0).setDepth(40002);

        // ⏱️ LIVE COOLDOWN TICKER
        let countdownTimer: Phaser.Time.TimerEvent | undefined;

        const updateReviveBtnUI = () => {
            const remaining = AdManager.getInstance().getRemainingCooldownSeconds();
            if (remaining > 0) {
                reviveBtn.setFillStyle(0x332211, 0.85);
                reviveBtn.setStrokeStyle(2, 0xffaa00);
                reviveText.setText(`📺 Revive in ${remaining}s (Cooldown)`);
                reviveText.setColor("#ffaa00");
            } else {
                reviveBtn.setFillStyle(0x1a441a, 0.95);
                reviveBtn.setStrokeStyle(2, 0x55ff55);
                reviveText.setText("📺 Watch Ad: Revive with 50% HP");
                reviveText.setColor("#ffffff");
            }
        };

        updateReviveBtnUI();

        countdownTimer = this.time.addEvent({
            delay: 1000,
            repeat: 75,
            callback: () => {
                if (this.deathModalGroup.length > 0) {
                    updateReviveBtnUI();
                } else {
                    countdownTimer?.remove();
                }
            }
        });

        reviveBtn.on("pointerdown", () => {
            const remaining = AdManager.getInstance().getRemainingCooldownSeconds();
            if (remaining > 0) {
                this.showFloatingText(this.player.x, this.player.y - 90, `⚠️ Ad on Cooldown! Available in ${remaining}s`, "#ffaa00", 2000);
                return;
            }

            countdownTimer?.remove();
            this.clearDeathModal();

            AdManager.getInstance().playAd("rewarded", (success: boolean) => {
                if (success && this.player) {
                    this.physics.world.resume();

                    this.player.hp = 50;
                    this.backpack.updateHP(50, this.player.maxHp);
                    this.player.clearTint();

                    // 💥 1. ERUPT REVIVAL SHOCKWAVE (160px Repulsion Blast)
                    this.cameras.main.shake(200, 0.015);

                    const blastRing = this.add.circle(this.player.x, this.player.y - 30, 15, 0x00ffff, 0.8);
                    blastRing.setStrokeStyle(4, 0xffff00).setDepth(25000);
                    this.tweens.add({
                        targets: blastRing,
                        radius: 160,
                        alpha: 0,
                        duration: 400,
                        ease: "Cubic.easeOut",
                        onComplete: () => blastRing.destroy()
                    });

                    // Fling all nearby enemies away from spawn spot!
                    if (this.waveManager) {
                        const activeZombies = this.waveManager.getActiveZombies();
                        activeZombies.forEach((zombie) => {
                            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y - 30, zombie.x, zombie.y - (zombie.displayHeight / 2));
                            if (dist <= 160) {
                                const flingDir = new Phaser.Math.Vector2(zombie.x - this.player.x, zombie.y - this.player.y).normalize();
                                zombie.takeDamage(10, flingDir, 350, "MELEE");
                            }
                        });
                    }

                    // 🛡️ 2. ACTIVATE 3.0s GOLDEN INVULNERABILITY SHIELD!
                    this.player.triggerReviveShield(3000);
                    this.showFloatingText(this.player.x, this.player.y - 110, "⚡ REVIVED WITH 3s INVULNERABILITY SHIELD!", "#00ffff", 3000);
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
            countdownTimer?.remove();
            this.clearDeathModal();
            this.resetToFarmAfterDefeat();
        });

        this.deathModalGroup = [modalBg, modalTitle, reviveBtn, reviveText, surrenderBtn, surrenderText];
    }

    private clearDeathModal() {
        this.deathModalGroup.forEach(obj => obj.destroy());
        this.deathModalGroup = [];
    }

    // 💀 EXTRACTION TAX: 35% with Minimum Floor of 2 Biomass
    private resetToFarmAfterDefeat() {
        this.backpack.biomassCount = Math.max(2, Math.floor(this.backpack.biomassCount * 0.65));
        this.player.hp = 100;
        this.backpack.updateHP(100, this.player.maxHp);
        this.player.clearTint();
        this.setNightLighting(false); // Reset to day if defeated

        const spawnObj = this.world.map.findObject("objects", (obj) => obj.name === "PlayerSpawn");
        this.player.setPosition(spawnObj?.x ?? 1600, spawnObj?.y ?? 1600);

        if (this.waveManager) {
            this.waveManager.onWaveFailed();
        }

        this.physics.world.resume();
        this.showFloatingText(this.player.x, this.player.y - 90, "Extraction Tax Applied (-35% Biomass)", "#ffaa00");
    }

    // 💰 SMOOTHED PLOT UNLOCK CURVE [3, 4, 6, 8, 10]
    private getNextPlotUnlockCost(): number {
        const unlockedCount = this.farmPlots.filter(p => p.isUnlocked).length;
        const costs = [3, 4, 6, 8, 10];
        const index = Math.min(costs.length - 1, unlockedCount - 3);
        return costs[Math.max(0, index)];
    }

    update(time: number, delta: number) {
        if (this.player && this.player.active) {
            // 🌟 Sits ABOVE the night overlay so the farmer stays 100% bright & saturated!
            this.player.setDepth(this.player.y); // 👈 Natural Y-Depth sorting!
            this.player.update(delta);
        }

        this.checkLootPickup();
        this.handleFenceBuildMode();
        this.handleHealHotkey();

        this.farmPlots.forEach(plot => plot.updatePlot(delta));
        this.herbPlots.forEach(hPlot => hPlot.updateHerbPlot(delta));

        this.updateSingleClosestPrompt();
        this.handleFarmingInteraction();

        // 🎯 1. BULLETPROOF PROJECTILE HIT DETECTION
        if (this.projectiles && this.projectiles.length > 0) {
            this.projectiles = this.projectiles.filter(p => p && p.active && p.body);
            const activeZombies = this.waveManager ? this.waveManager.getActiveZombies() : [];

            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const proj = this.projectiles[i];
                if (!proj || !proj.active || !proj.body) continue;

                const pBox = proj.getBounds();
                let hitTarget = false;

                // A. Hit Active Zombies
                for (const zombie of activeZombies) {
                    if (zombie && zombie.active) {
                        if (Phaser.Geom.Intersects.RectangleToRectangle(pBox, zombie.getBounds())) {
                            proj.onHitZombie(zombie);
                            hitTarget = true;
                            break;
                        }
                    }
                }
                if (hitTarget || !proj.active) continue;

                // B. Hit Tree Base (Roots)
                if (this.world && this.world.treeBottomGroup) {
                    for (const tree of this.world.treeBottomGroup.getChildren()) {
                        const t = tree as Phaser.GameObjects.Sprite;
                        if (t && t.body) {
                            const b = t.body as Phaser.Physics.Arcade.StaticBody;
                            if (pBox.right >= b.x && pBox.left <= b.right && pBox.bottom >= b.y && pBox.top <= b.bottom) {
                                proj.onHitObstacle("TREE");
                                hitTarget = true;
                                break;
                            }
                        }
                    }
                }
                if (hitTarget || !proj.active) continue;

                // C. Hit Solid Rocks
                if (this.world && this.world.rockGroup) {
                    for (const rock of this.world.rockGroup.getChildren()) {
                        const r = rock as Phaser.GameObjects.Sprite;
                        if (r && r.body) {
                            const b = r.body as Phaser.Physics.Arcade.StaticBody;
                            if (pBox.right >= b.x && pBox.left <= b.right && pBox.bottom >= b.y && pBox.top <= b.bottom) {
                                proj.onHitObstacle("ROCK");
                                break;
                            }
                        }
                    }
                }
            }
        }

        // 🌊 2. WAVE MANAGER & BOSS LOGIC
        if (this.waveManager) {
            this.waveManager.updateWaves(this.player.x, this.player.y, this.fenceManager);

            const activeZombies = this.waveManager.getActiveZombies();
        activeZombies.forEach(z => z.setDepth(z.y)); // 👈 Natural Y-Depth sorting!

            const remaining = this.waveManager.getRemainingZombieCount();

            // 👑 Update Boss Health Bar
            const boss = this.waveManager.activeBoss;
            if (boss && boss.active && boss.hp > 0) {
                this.bossBarGroup.forEach(el => (el as any).setVisible(true));

                const pct = Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1);
                this.bossBarFill.displayWidth = 312 * pct;
                this.bossBarText.setText(`👑 THE ROTTING TITAN: ${boss.hp} / ${boss.maxHp}`);

                // Real-Time Armor Status
                if (!boss.isEnraged) {
                    if (boss.isArmorCrackedPhase1) {
                        this.bossArmorStatusText.setText("🟢 PHASE 1: BARK CRACKED! (FULL DMG)");
                        this.bossArmorStatusText.setColor("#55ff55");
                    } else {
                        this.bossArmorStatusText.setText("🛡️ PHASE 1: BARK ARMORED (50% DEF - USE 'Q' ROOT)");
                        this.bossArmorStatusText.setColor("#ffaa00");
                    }
                } else {
                    if (boss.isArmorCrackedPhase2) {
                        this.bossArmorStatusText.setText("💥 PHASE 2: MOLTEN ARMOR SHATTERED! (MELT HIM!)");
                        this.bossArmorStatusText.setColor("#00ffff");
                    } else {
                        this.bossArmorStatusText.setText("🔥 PHASE 2: ENRAGED! MOLTEN BARK (USE 2ND 'Q' ROOT!)");
                        this.bossArmorStatusText.setColor("#ff3300");
                    }
                }
            } else {
                this.bossBarGroup.forEach(el => (el as any).setVisible(false));
            }

            // 📋 3. LIVE BOSS INTEL & READINESS CHECKLIST (Active during Wave 5 Prep Phase)
            const isWave5Prep = !this.waveManager.isWaveActive && (this.waveManager.currentWave === 4 || (this.waveManager.currentWave === 5 && this.waveManager.wasWaveDefeated));

            if (isWave5Prep) {
                this.bossIntelGroup.forEach(el => (el as any).setVisible(true));

                const hasTotemLvl2 = this.scarecrow.level >= 2;
                const hasAmmo = this.backpack.pepperAmmo >= 20;
                const hasHerbs = this.backpack.healHerbs >= 1;

                const totemStatus = hasTotemLvl2 ? "🟢 Totem Lvl 2 (2 'Q' Charges Ready)" : "🔴 Totem Lvl 1 (Need Lvl 2 for 2 'Q' Charges!)";
                const ammoStatus = hasAmmo ? `🟢 Pepper Ammo: ${this.backpack.pepperAmmo}/20` : `🔴 Pepper Ammo: ${this.backpack.pepperAmmo}/20 (Farm more!)`;
                const herbStatus = hasHerbs ? `🟢 Heal Herbs: ${this.backpack.healHerbs} in bag` : "🔴 Heal Herbs: 0 in bag (Plant herbs!)";

                this.bossIntelText.setText(
                    `${totemStatus}\n` +
                    `${ammoStatus}\n` +
                    `${herbStatus}`
                );

                this.waveText.setText("⚠️ BOSS PREPARATION: WAVE 5 — THE ROTTING TITAN | Press [N] When Ready");
                this.waveText.setColor("#ffcc00");
            } else {
                this.bossIntelGroup.forEach(el => (el as any).setVisible(false));

                // =========================================================================
        // 🌊 WAVE BANNER DISPLAY & LIGHTING SYNC (Preserves All States & Unlocks!)
        // =========================================================================
        if (this.waveManager.isWaveActive) {
            this.setNightLighting(true); // 🌙 Spooky Night during active wave!
            this.waveText.setText(`WAVE ${this.waveManager.currentWave} IN PROGRESS | Hostiles: ${remaining}`);
            this.waveText.setColor("#ff3333");
        } else if (this.waveManager.wasWaveDefeated) {
            this.setNightLighting(false); // ☀️ Morning sun returns on defeat
            const retryWave = this.waveManager.currentWave + 1;
            this.waveText.setText(`WAVE ${retryWave} FAILED - PREP PHASE | Press [N] to Retry Wave ${retryWave}`);
            this.waveText.setColor("#ffaa00");
        } else if (this.waveManager.currentWave === 5 && !this.waveManager.isWaveActive) {
            this.setNightLighting(false); // ☀️ Morning sun on Act 1 Victory!
            this.waveText.setText(`🏆 ACT 1 CLEARED! THE ROTTING TITAN DEFEATED! | Press [N] for Wave 6`);
            this.waveText.setColor("#ffcc00");

            // 🌾 Signal Seed Composter & Show Victory Modal
            if (!this.seedComposter.isUnlocked && !this.seedComposter.visible) {
                this.seedComposter.signalUnlockReady();
                this.showAct1VictoryModal();
            }
        } else if (this.waveManager.currentWave > 0 && !this.waveManager.isWaveActive) {
            this.setNightLighting(false); // ☀️ Morning sun returns on wave clear
            this.waveText.setText(`WAVE ${this.waveManager.currentWave} CLEARED - PREP PHASE | Press [N] to Start Wave ${this.waveManager.currentWave + 1}`);
            this.waveText.setColor("#55ff55");
        }
            }
        }

        // 👟 4. Wave 4 Clear Reward: UNLOCK COMBAT DODGE ROLL & STAMINA UI!
        if (this.waveManager && this.waveManager.currentWave === 4 && !this.waveManager.isWaveActive && !this.backpack.isDodgeUnlocked) {
            this.backpack.unlockDodgeUI(); // Reveals the Stamina Bar!
            this.showFloatingText(this.player.x, this.player.y - 110, "👟 DODGE ROLL UNLOCKED! [Press SHIFT to Dash]", "#00ffff", 4000);
        }

        // 📦 5. Dynamic Emergency Airdrop Button Driver (Only shows when truly broke in Day Phase!)
        const isBrokeInDay = this.waveManager && !this.waveManager.isWaveActive && this.backpack.biomassCount <= 1 && this.backpack.pepperSeeds <= 1 && !this.hasClaimedAirdropThisWave;

        if (isBrokeInDay) {
            this.airdropBtn.setVisible(true);
            this.airdropText.setVisible(true);

            const cooldown = AdManager.getInstance().getRemainingCooldownSeconds();
            if (cooldown > 0) {
                this.airdropText.setText(`📦 Airdrop (${cooldown}s)`);
                this.airdropText.setColor("#ffaa00");
                this.airdropBtn.setStrokeStyle(1.5, 0x885500);
            } else {
                this.airdropText.setText("📦 Airdrop: +3 Biomass & +2 Seeds");
                this.airdropText.setColor("#55ff55");
                this.airdropBtn.setStrokeStyle(2, 0x55ff55);
            }
        } else {
            this.airdropBtn.setVisible(false);
            this.airdropText.setVisible(false);
        }

        // 🗺️ 5. Update Radar Minimap with Player, Zombies, and Dropped Biomass
        if (this.minimap && this.player) {
            const activeZombies = this.waveManager ? this.waveManager.getActiveZombies() : [];
            const biomassOrbs = this.children.getChildren().filter(c => c.getData("type") === "biomass");

            this.minimap.update(this.player.x, this.player.y, activeZombies, biomassOrbs);
        }
    }


    private handleHealHotkey() {
        // 🛑 LOCKOUT: Dead players cannot cast Root-Burst!
        if (!this.player || this.player.hp <= 0) return;
        if (Phaser.Input.Keyboard.JustDown(this.healKey)) {
            if (this.backpack.healHerbs > 0 && this.player.hp < this.player.maxHp) {
                this.backpack.addHealHerbs(-1);
                this.player.heal(25);
                this.showFloatingText(this.player.x, this.player.y - 90, "+25 HP Healed!", "#55ff55");
            } else if (this.backpack.healHerbs <= 0) {
                this.showFloatingText(this.player.x, this.player.y - 90, "No Heal Herbs in Backpack!", "#ff5555");
            } else if (this.player.hp >= this.player.maxHp) {
                this.showFloatingText(this.player.x, this.player.y - 90, "HP Already Full!", "#ffff55");
            }
        }
    }

    private isPlayerTouching(target: Phaser.GameObjects.Sprite | Phaser.GameObjects.GameObject): boolean {
        if (!this.player || !this.player.body) return false;
        
        const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
        const targetSprite = target as Phaser.GameObjects.Sprite;

        // Zero-allocation AABB check (Blazing fast!)
        const targetHalfW = (targetSprite.displayWidth || 36) / 2;
        const targetHalfH = (targetSprite.displayHeight || 36) / 2;
        const targetMinX = targetSprite.x - targetHalfW;
        const targetMaxX = targetSprite.x + targetHalfW;
        const targetMinY = targetSprite.y - targetHalfH;
        const targetMaxY = targetSprite.y + targetHalfH;

        const playerMinX = playerBody.x - 4;
        const playerMaxX = playerBody.x + playerBody.width + 4;
        const playerMinY = playerBody.y - 4;
        const playerMaxY = playerBody.y + playerBody.height + 4;

        return !(playerMaxX < targetMinX || playerMinX > targetMaxX || playerMaxY < targetMinY || playerMinY > targetMaxY);
    }

    private updateSingleClosestPrompt() {
        this.farmPlots.forEach(p => p.hidePrompt());
        this.herbPlots.forEach(hp => hp.hidePrompt());
        if (this.scarecrow) this.scarecrow.hidePrompt();
        if (this.craftingBench) this.craftingBench.hidePrompt();
        if (this.seedComposter) this.seedComposter.hidePrompt();
        if (this.fenceManager) this.fenceManager.hidePrompt();

        if (!this.player || !this.player.body) return;

        // Build Mode check
        if (this.isPlacingFence) {
            if (this.craftingBench && this.isPlayerTouching(this.craftingBench)) {
                (this.craftingBench as any).promptText?.setText("⚠️ Exit Build Mode [Press F] to Interact").setColor("#ffaa00");
                return;
            }
            if (this.seedComposter && this.isPlayerTouching(this.seedComposter)) {
                (this.seedComposter as any).promptText?.setText("⚠️ Exit Build Mode [Press F] to Interact").setColor("#ffaa00");
                return;
            }
            if (this.scarecrow && this.isPlayerTouching(this.scarecrow)) {
                (this.scarecrow as any).promptText?.setText("⚠️ Exit Build Mode [Press F] to Interact").setColor("#ffaa00");
                return;
            }
            for (const plot of this.farmPlots) {
                if (this.isPlayerTouching(plot)) {
                    (plot as any).promptText?.setText("⚠️ Exit Build Mode [Press F] to Interact").setColor("#ffaa00");
                    return;
                }
            }
            for (const hPlot of this.herbPlots) {
                if (this.isPlayerTouching(hPlot)) {
                    (hPlot as any).promptText?.setText("⚠️ Exit Build Mode [Press F] to Interact").setColor("#ffaa00");
                    return;
                }
            }
            return;
        }

        const isWaveActive = this.waveManager ? this.waveManager.isWaveActive : false;

        // Ruins Rebuild Prompt
        if (this.fenceManager && this.fenceManager.hasNearbyBrokenRuins(this.player.x, this.player.y)) {
            this.fenceManager.showRuinsPrompt(this.player.x, this.player.y, this.backpack.biomassCount, isWaveActive);
            return;
        }

        // Crafting Bench Check
        if (this.craftingBench && this.isPlayerTouching(this.craftingBench)) {
            this.craftingBench.showPrompt(this.backpack.biomassCount, isWaveActive);
            return;
        }

        // Seed Composter Check
        if (this.seedComposter && this.seedComposter.visible && this.isPlayerTouching(this.seedComposter)) {
            this.seedComposter.showPrompt(this.backpack.pepperSeeds, isWaveActive);
            return;
        }

        // 3. Central Scarecrow Totem Check
        if (this.scarecrow && this.isPlayerTouching(this.scarecrow)) {
            const waveNum = this.waveManager ? this.waveManager.currentWave : 0;
            this.scarecrow.showPrompt(waveNum);
            return;
        }

        // Farm Plots Check
        for (const plot of this.farmPlots) {
            if (this.isPlayerTouching(plot)) {
                const cost = this.getNextPlotUnlockCost();
                plot.showPrompt(this.backpack.biomassCount, this.backpack.pepperSeeds, cost);
                return;
            }
        }

        // Herb Plots Check
        for (const hPlot of this.herbPlots) {
            if (this.isPlayerTouching(hPlot)) {
                hPlot.showPrompt(this.backpack.pepperSeeds, isWaveActive);
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
            this.showFloatingText(this.player.x, this.player.y - 90, "Farming Locked During Active Wave!", "#ff3333");
            return;
        }

        // 1. Rebuild Ruins
        if (isEJustDown && this.fenceManager.hasNearbyBrokenRuins(this.player.x, this.player.y)) {
            const rebuilt = this.fenceManager.rebuildNearbyBrokenFences(this.player.x, this.player.y, this.backpack);
            if (rebuilt > 0) {
                this.showFloatingText(this.player.x, this.player.y - 90, `Rebuilt +${rebuilt} Fences! (-1 Biomass)`, "#55ff55");
                return;
            }
        }

        // 2. Crafting Bench Interaction
        if (this.craftingBench && this.isPlayerTouching(this.craftingBench)) {
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

        // 3. Seed Composter Interaction
        if (this.seedComposter && this.seedComposter.visible && this.isPlayerTouching(this.seedComposter)) {
            if (isEJustDown) {
                if (!this.seedComposter.isUnlocked) {
                    this.seedComposter.unlockComposter();
                    this.showFloatingText(this.seedComposter.x, this.seedComposter.y - 30, "Seed Composter Activated!", "#55ff55");
                } else {
                    const success = this.seedComposter.compost(this.backpack);
                    if (success) {
                        this.showFloatingText(this.seedComposter.x, this.seedComposter.y - 30, "Composted 4 Seeds (+1 Biomass)!", "#55ff55");
                    } else {
                        this.showFloatingText(this.seedComposter.x, this.seedComposter.y - 30, "Need >5 Seeds to Compost!", "#ffaa00");
                    }
                }
            }
            return;
        }

        // 4. Scarecrow Totem Interaction
        if (this.scarecrow && this.isPlayerTouching(this.scarecrow)) {
            if (isEJustDown) {
                const yieldData = this.scarecrow.vacuumHarvestAll(this.farmPlots, this.backpack, this);
                if (yieldData.totalAmmo > 0 || yieldData.totalSeeds > 0) {
                    for (let i = 0; i < yieldData.totalAmmo; i++) {
                        this.backpack.recordHarvest();
                    }

                    this.showFloatingText(
                        this.scarecrow.x, 
                        this.scarecrow.y - 30, 
                        `+${yieldData.totalAmmo} Ammo | +${yieldData.totalSeeds} Seeds`, 
                        "#ffaa00"
                    );
                }
            }

            if (isUJustDown) {
                const waveNum = this.waveManager ? this.waveManager.currentWave : 0;

                if (this.scarecrow.level === 2 && waveNum < 5) {
                    this.showFloatingText(this.scarecrow.x, this.scarecrow.y - 30, "Lvl 3 Locked! Defeat Wave 5 Boss to Unlock", "#ffaa00");
                    return;
                }

                const success = this.scarecrow.upgradeTotem(this.backpack, this.farmPlots, this, waveNum);
                if (success) {
                    this.showFloatingText(this.scarecrow.x, this.scarecrow.y - 30, `Totem & Max 'Q' Upgraded to Lvl ${this.scarecrow.level}!`, "#55ff55");
                } else {
                    const upgradeCost = this.scarecrow.level === 1 ? 10 : 20;
                    this.showFloatingText(this.scarecrow.x, this.scarecrow.y - 30, `Need ${upgradeCost} Biomass to Upgrade!`, "#ff5555");
                }
            }
            return;
        }

        // 5. Herb Plots Interaction
        for (const hPlot of this.herbPlots) {
            if (this.isPlayerTouching(hPlot)) {
                if (isEJustDown) {
                    if (!hPlot.isUnlocked && this.backpack.pepperSeeds >= 4) {
                        this.backpack.addPepperSeeds(-4);
                        hPlot.unlockHerbPlot();
                        this.showFloatingText(hPlot.x, hPlot.y - 30, "Herb Plot Unlocked! (-4 Seeds)", "#55ff55");
                    } else if (hPlot.isUnlocked && hPlot.state === HerbState.EMPTY) {
                        // 🛡️ REJECTS IF SEEDS <= 2 (Prevents Pepper Farm Softlocks!)
                        if (this.backpack.pepperSeeds > 2) {
                            this.backpack.addPepperSeeds(-2);
                            hPlot.plantHerb();
                            this.showFloatingText(hPlot.x, hPlot.y - 30, "Heal Herb Cultivated! (-2 Seeds)", "#55ff55");
                        } else {
                            this.showFloatingText(hPlot.x, hPlot.y - 30, "Must keep at least 2 seeds for Pepper Farm!", "#ffaa00");
                        }
                    } else if (hPlot.isUnlocked && hPlot.state === HerbState.MATURE) {
                        const harvested = hPlot.harvestHerb();
                        if (harvested) {
                            this.backpack.addHealHerbs(1);
                            this.backpack.recordHarvest();
                            this.showFloatingText(hPlot.x, hPlot.y - 30, "+1 Heal Herb (Press H to Heal!)", "#00ff66");
                        }
                    }
                }
                return;
            }
        }

        // 6. Pepper Farm Plots Interaction
        if (isEJustDown) {
            for (const plot of this.farmPlots) {
                if (this.isPlayerTouching(plot)) {
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
                            this.backpack.recordHarvest();
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
            // ONLY check objects tagged explicitly as a melee pitchfork hitbox!
            if (child.getData("isMeleeHitbox") && !child.getData("hasHit")) {
                const weaponBounds = (child as Phaser.GameObjects.Rectangle).getBounds();

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
                    
                    this.showFloatingText(this.player.x, this.player.y - 90, `+${amount} Biomass`, "#55ff55", 2200);
                    child.destroy();
                }
            }
        });
    }

    public showFloatingText(x: number, y: number, text: string, color: string = "#ffffff", duration: number = 2800) {
        const popup = this.add.text(x, y, text, {
            fontFamily: "Arial",
            fontSize: "13px",
            color: color,
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(30000);

        this.tweens.add({
            targets: popup,
            y: popup.y - 25,
            alpha: 0,
            duration: duration,
            ease: "Cubic.easeOut",
            onComplete: () => popup.destroy()
        });
    }

    private triggerRootBurst() {
        // 🛑 LOCKOUT: Dead players cannot cast Root-Burst!
        if (!this.player || this.player.hp <= 0) return;
        const currentTime = this.time.now;
        if (currentTime - this.lastRootBurstTime < 1000) return; // 1s Safety Buffer

        if (this.backpack.rootCharges <= 0) {
            this.showFloatingText(this.player.x, this.player.y - 90, "No Root Burst Charges! (Harvest Crops)", "#ffaa00");
            return;
        }

        if (this.player && this.player.triggerCombatStance) {
        this.player.triggerCombatStance(450); // Snaps to side combat stance towards cursor for 0.45s!
    }

        this.backpack.consumeRootCharge();
        this.lastRootBurstTime = currentTime;

        // 60ms Hit-stop Freeze & Heavy Shake
        this.triggerHitStop(60);
        this.cameras.main.shake(120, 0.008);

        const aoeRadius = 110;
        const burstDamage = 45;
        const burstX = this.player.x;
        const burstY = this.player.y - 20;

        // Visual 360° Root Spikes Ring
        const ring = this.add.circle(burstX, burstY, 10, 0x44aa33, 0.6);
        ring.setStrokeStyle(4, 0x88ff44).setDepth(25000);

        this.tweens.add({
            targets: ring,
            radius: aoeRadius,
            alpha: 0,
            duration: 350,
            ease: "Quad.easeOut",
            onComplete: () => ring.destroy()
        });

        // Spawn 16 Thorny Root Spike Particles
        for (let i = 0; i < 16; i++) {
            const angle = Phaser.Math.DegToRad(i * (360 / 16));
            const spikeDist = Phaser.Math.Between(30, aoeRadius);
            const spikeX = burstX + Math.cos(angle) * spikeDist;
            const spikeY = burstY + Math.sin(angle) * spikeDist;

            const spike = this.add.rectangle(spikeX, spikeY, 8, 20, 0x553311);
            spike.setRotation(angle + Math.PI / 2).setDepth(spikeY);

            this.tweens.add({
                targets: spike,
                scaleY: 1.8,
                alpha: 0,
                duration: 400,
                onComplete: () => spike.destroy()
            });
        }

        this.showFloatingText(burstX, burstY - 60, "🌿 ROOT-BURST CLEAVE!", "#55ff55", 1500);

        // Damage All Zombies in 110px Radius
        const activeZombies = this.waveManager.getActiveZombies();
        activeZombies.forEach((zombie) => {
            const dist = Phaser.Math.Distance.Between(burstX, burstY, zombie.x, zombie.y - (zombie.displayHeight / 2));
            if (dist <= aoeRadius) {
                const knockbackDir = new Phaser.Math.Vector2(zombie.x - burstX, zombie.y - burstY).normalize();
                zombie.takeDamage(burstDamage, knockbackDir, 320, "MELEE");
            }
        });
    }

    private showAct1VictoryModal() {
        if (this.act1VictoryModalGroup.length > 0) return;

        const windowX = 600;
        const windowY = 320;

        const modalBg = this.add.rectangle(windowX, windowY, 360, 240, 0x0a1a0a, 0.95);
        modalBg.setStrokeStyle(3, 0xffcc00).setScrollFactor(0).setDepth(40000);

        const title = this.add.text(windowX, windowY - 85, "🏆 ACT 1 VICTORY!", {
            fontFamily: "Arial",
            fontSize: "20px",
            color: "#ffcc00",
            stroke: "#000000",
            strokeThickness: 4
        }).setOrigin(0.5).setScrollFactor(0).setDepth(40001);

        const subtitle = this.add.text(windowX, windowY - 55, "The Rotting Titan has been Defeated!", {
            fontFamily: "Arial",
            fontSize: "12px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 2
        }).setOrigin(0.5).setScrollFactor(0).setDepth(40001);

        const rewards = this.add.text(windowX, windowY + 5, 
            "🌾 Seed Composter Unlocked! [At Crafting Base]\n" +
            "🚜 Death Harvester War Tractor Teaser!\n" +
            "👑 Totem Level 3 Upgrade Unlocked!\n" +
            "♾️ Endless Horde Mode Unlocked!", {
            fontFamily: "Arial",
            fontSize: "11px",
            color: "#55ff55",
            lineSpacing: 6,
            stroke: "#000000",
            strokeThickness: 2
        }).setOrigin(0.5).setScrollFactor(0).setDepth(40001);

        const continueBtn = this.add.rectangle(windowX, windowY + 80, 200, 32, 0x1a441a, 0.95);
        continueBtn.setStrokeStyle(2, 0x55ff55).setScrollFactor(0).setDepth(40001).setInteractive({ useHandCursor: true });

        const btnText = this.add.text(windowX, windowY + 80, "Continue to Day Phase", {
            fontFamily: "Arial",
            fontSize: "12px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 2
        }).setOrigin(0.5).setScrollFactor(0).setDepth(40002);

        continueBtn.on("pointerdown", () => {
            this.act1VictoryModalGroup.forEach(el => el.destroy());
            this.act1VictoryModalGroup = [];
        });

        this.act1VictoryModalGroup = [modalBg, title, subtitle, rewards, continueBtn, btnText];
    }

    // Location: inside src/scenes/MainScene.ts -> replace setNightLighting()
    public setNightLighting(isNight: boolean) {
        if (this.isNightActive === isNight) return;
        this.isNightActive = isNight;

        // 🌙 Midnight Tint for Textures (Day = 0xffffff, Night = 0x556688)
        const targetTint = isNight ? 0x445577 : 0xffffff;

        // 1. Tint Ground & Decoration Tilemap Layers
        if (this.world && this.world.map) {
            const groundLayer = this.world.map.getLayer("ground")?.tilemapLayer;
            if (groundLayer) groundLayer.setTint(targetTint);

            const decorLayer = this.world.map.getLayer("decoration")?.tilemapLayer;
            if (decorLayer) decorLayer.setTint(targetTint);
        }

        // 2. Tint Farm Base Dirt Clearing (Uses setFillStyle for Ellipse Shape!)
        if (this.farmDirtClearing) {
            const dirtColor = isNight ? 0x1a1008 : 0x3d2714;
            this.farmDirtClearing.setFillStyle(dirtColor, 0.88);
            this.farmDirtClearing.setStrokeStyle(4, isNight ? 0x0f0804 : 0x2b1a0c, 0.6);
        }

        // 3. Tint Environment Trees (No more crashes, trees will darken!)
        if (this.world && this.world.treeBottomGroup) {
            this.world.treeBottomGroup.getChildren().forEach((tree: any) => {
                if (tree && typeof tree.setTint === "function") {
                    tree.setTint(targetTint);
                }
            });
        }

        // 4. Tint Environment Rocks
        if (this.world && this.world.rockGroup) {
            this.world.rockGroup.getChildren().forEach((rock: any) => {
                if (rock && typeof rock.setTint === "function") {
                    rock.setTint(targetTint);
                }
            });
        }

        // 5. Tint Farm Structures (Benches, Totem, Fences)
        if (this.scarecrow && typeof this.scarecrow.setTint === "function") {
            this.scarecrow.setTint(isNight ? 0x886622 : 0xffcc44);
        }
        if (this.craftingBench && typeof this.craftingBench.setTint === "function") {
            this.craftingBench.setTint(isNight ? 0x664411 : 0xcc8833);
        }
        if (this.seedComposter && typeof this.seedComposter.setTint === "function") {
            this.seedComposter.setTint(isNight ? 0x224411 : 0x55aa33);
        }

        // 6. Tint Environment Bushes (No more glowing bushes!)
        if (this.world && this.world.bushGroup) {
            this.world.bushGroup.getChildren().forEach((bush: any) => {
                if (bush && typeof bush.setTint === "function") {
                    bush.setTint(targetTint); // 👈 Same exact midnight navy (0x445577) as trees!
                }
            });
        }
    }
}