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
import { AdManager } from "../systems/AdManager.ts";
import DebugManager from "../utils/DebugManager.ts";
import SeedComposter from "../world/SeedComposter.ts";
import Minimap from "../ui/Minimap.ts";
import { TrapManager } from "../world/TrapManager.ts";
import type { TrapType } from "../world/TrapManager.ts";

export default class MainScene extends Phaser.Scene {
    public player!: Player;
    public world!: WorldGenerator;
    public backpack!: Backpack;
    private minimap!: Minimap;
    
    private farmPlots: FarmPlot[] = [];
    private herbPlots: HerbPlot[] = [];
    private scarecrow!: Scarecrow;
    private craftingBench!: CraftingBench;
    public trapManager!: TrapManager;
    private waveManager!: WaveManager;
    public biomassGroup!: Phaser.Physics.Arcade.Group;
    public rootSpores: Phaser.GameObjects.Arc[] = [];
    private waveText!: Phaser.GameObjects.Text;

    private interactKey!: Phaser.Input.Keyboard.Key;
    private upgradeKey!: Phaser.Input.Keyboard.Key;
    private fenceModeKey!: Phaser.Input.Keyboard.Key;
    private healKey!: Phaser.Input.Keyboard.Key;
    private rootBurstKey!: Phaser.Input.Keyboard.Key;
    private projectiles: SeedProjectile[] = [];

    // 🔨 Build Bar [F] UI & Ghost
    public isBuildBarOpen: boolean = false;
    private buildBarGroup: Phaser.GameObjects.GameObject[] = [];
    private ghostTrapBox!: Phaser.GameObjects.Rectangle;
    private ghostRangeCircle!: Phaser.GameObjects.Arc;
    private deathModalGroup: Phaser.GameObjects.GameObject[] = [];

    private farmDirtClearing!: Phaser.GameObjects.Rectangle;
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
    public isNightActive: boolean = false;

    private grassFloor!: Phaser.GameObjects.TileSprite;

    private hasRewardedPumpkins: boolean = false;
    private isEKeyHeld: boolean = false;

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

        this.load.image('pitchfork', 'assets/weapons/pitchfork.png');
        this.load.image("grass_tile", "assets/tiles/grass_tile.png");

        // --- CLEAN PLAYER SPRITES (128x128 Standard) ---
        this.load.image("player_idle", "assets/player/player_idle.png");
        this.load.spritesheet("player_side", "assets/player/player_side.png", {
            frameWidth: 192,  // 👈 Change to 192
            frameHeight: 192 // 👈 Change to 192
        });

        this.load.spritesheet("zombie_walker", "assets/enemies/zombie_walker.png", {
            frameWidth: 192,
            frameHeight: 192
        });

        this.load.spritesheet("zombie_gibs", "assets/enemies/zombie_gibs.png", {
            frameWidth: 24,
            frameHeight: 24
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

        // =========================================================================
        // 🌿 1. SEAMLESS 3072x3072 TILESPRITE GRASS ARENA
        // =========================================================================
        const mapSize = 3072;
        this.grassFloor = this.add.tileSprite(mapSize / 2, mapSize / 2, mapSize, mapSize, "grass_tile");
        this.grassFloor.setDepth(0);
        
        // 🌿 Shrinks grass blades to natural ankle-height!
        this.grassFloor.setTileScale(0.45, 0.45);

        this.world = new WorldGenerator(this);
        this.world.generate(mapSize, mapSize);

        // 📍 Exact Map Center Spawn (1536, 1536)
        const spawnX = mapSize / 2;
        const spawnY = mapSize / 2;

        this.player = new Player(this, spawnX, spawnY);
        this.backpack = new Backpack(this);

        // 🚀 Fast Loot Group (Eliminates 800-object scene traversal lag)
        // 💎 1. Procedural 3D Shaded Spherical Emerald Gem (GPU Cached)
        if (!this.textures.exists("biomass_emerald")) {
            const gfx = this.make.graphics({ x: 0, y: 0 });
            // Layer 1: Dark 3D Shadow Base
            gfx.fillStyle(0x063b17, 1.0);
            gfx.fillCircle(13, 13, 11);
            // Layer 2: Rich Translucent Jade Body
            gfx.fillStyle(0x0fa842, 1.0);
            gfx.fillCircle(13, 13, 9.5);
            // Layer 3: Top-Left Offset 3D Light Core
            gfx.fillStyle(0x35f575, 1.0);
            gfx.fillCircle(10.5, 10.5, 6.5);
            // Layer 4: Specular Sunlit Hotspot
            gfx.fillStyle(0xaaffcc, 0.95);
            gfx.fillCircle(8.5, 8.5, 3.2);
            // Layer 5: Pure White Crystalline Glint
            gfx.fillStyle(0xffffff, 1.0);
            gfx.fillCircle(7.5, 7.5, 1.4);
            // Layer 6: Soft Outer Ambient Rim Glow
            gfx.lineStyle(1.5, 0x55ff88, 0.6);
            gfx.strokeCircle(13, 13, 11.5);
            gfx.generateTexture("biomass_emerald", 26, 26);
            gfx.destroy();
        }

        // 🧲 2. TRIPLE-DISTANCE VAMPIRE SURVIVORS MEGA-SLINGSHOT SUCTION
        this.biomassGroup = this.physics.add.group();
        this.physics.add.overlap(this.player, this.biomassGroup, (_player, gemObj) => {
            const gem = gemObj as Phaser.GameObjects.Sprite;
            if (!gem || !gem.active || gem.getData("isCollecting")) return;

            gem.setData("isCollecting", true);
            if (gem.body) (gem.body as Phaser.Physics.Arcade.Body).enable = false;

            const amount = gem.getData("amount") || 1;
            
            // Clean up 3D revolving components
            ["orbitalRing"].forEach(key => {
                const item = gem.getData(key) as Phaser.GameObjects.GameObject;
                if (item && item.active) item.destroy();
            });

            // 💎 Define glint and aura safely in scope
            const glint = gem.getData("glint") as Phaser.GameObjects.Arc;
            const aura = gem.getData("aura") as Phaser.GameObjects.Arc;
            const groundLight = gem.getData("groundLight") as Phaser.GameObjects.Arc;
            if (groundLight && groundLight.active) groundLight.destroy();

            const startX = gem.x;
            const startY = gem.y;
            const chestX = this.player.x;
            const chestY = this.player.y - (this.player.displayHeight * 0.45);
            // 🌳 Y-Sorted: Renders in front of player, but BEHIND trees when standing behind them!
            const collectDepth = this.player.depth + 2;

            // 🏹 TRIPLE-DISTANCE SLINGSHOT VECTOR
            const dx = startX - chestX;
            const dy = startY - chestY;
            const len = Math.hypot(dx, dy) || 1;
            const normX = dx / len;
            const normY = dy / len;
            
            // Randomize curve side (left or right orbital sweep)
            const side = Math.random() < 0.5 ? 1 : -1;
            const perpX = -normY * side;
            const perpY = normX * side;

            // Point 1: Flings 115px OUTWARD away from player (TRIPLE the previous distance!)
            const p1X = startX + normX * 115 + perpX * 55;
            const p1Y = startY + normY * 115 + perpY * 55;

            // Point 2: Wide sweeping 140px orbital flank
            const p2X = (startX + chestX) / 2 + perpX * 140;
            const p2Y = (startY + chestY) / 2 + perpY * 70;

            let prevX = startX;
            let prevY = startY;
            let frameCount = 0;
            let progress = { t: 0 };

            this.tweens.add({
                targets: progress,
                t: 1,
                duration: 460,
                ease: "Cubic.easeInOut",
                onUpdate: () => {
                    if (!gem.active) return;
                    const t = progress.t;
                    const u = 1 - t;

                    // Cubic Bezier: Massive 115px kickback -> Wide orbital loop -> Chest plunge
                    const liveChestX = this.player.x;
                    const liveChestY = this.player.y - (this.player.displayHeight * 0.45);

                    gem.x = u * u * u * startX + 3 * u * u * t * p1X + 3 * u * t * t * p2X + t * t * t * liveChestX;
                    gem.y = u * u * u * startY + 3 * u * u * t * p1Y + 3 * u * t * t * p2Y + t * t * t * liveChestY;

                    // 💎 Keep the shiny glint locked onto the front face of the flying gem
                    if (glint && glint.active) {
                        glint.setPosition(gem.x - 3, gem.y - 4).setDepth(collectDepth + 1);
                    }
                    if (aura && aura.active) {
                        aura.setPosition(gem.x, gem.y).setDepth(collectDepth - 1);
                    }

                    // ⚡ Shiny Shooting-Star Lead Streak + 2 Trailing Follower Embers
                    frameCount++;
                    if (frameCount % 3 === 0) {
                        const moveAngle = Math.atan2(gem.y - prevY, gem.x - prevX);
                        const cosA = Math.cos(moveAngle);
                        const sinA = Math.sin(moveAngle);

                        // 1. Existing Shiny Lead Streak (100% UNTOUCHED)
                        const streak = this.add.ellipse(gem.x, gem.y, 10, 3, 0xeeffaa);
                        streak.setRotation(moveAngle).setBlendMode(Phaser.BlendModes.ADD).setDepth(collectDepth);

                        this.tweens.add({
                            targets: streak,
                            scaleX: 0.2,
                            scaleY: 0.2,
                            alpha: 0,
                            duration: 200,
                            ease: "Quad.easeOut",
                            onComplete: () => streak.destroy()
                        });

                        // 2. ✨ 2 Follower Micro-Trails Tailing Behind the Lead Streak (Zero-Lag)
                        [-1, 1].forEach((side) => {
                            const trailX = gem.x - cosA * 7 + (-sinA * side * 3.5);
                            const trailY = gem.y - sinA * 7 + (cosA * side * 3.5);

                            const subTrail = this.add.ellipse(trailX, trailY, 6, 2, 0x55ff99);
                            subTrail.setRotation(moveAngle).setBlendMode(Phaser.BlendModes.ADD).setDepth(collectDepth);

                            this.tweens.add({
                                targets: subTrail,
                                scaleX: 0.1,
                                scaleY: 0.1,
                                alpha: 0,
                                duration: 240,
                                ease: "Quad.easeOut",
                                onComplete: () => subTrail.destroy()
                            });
                        });
                    }

                    prevX = gem.x;
                    prevY = gem.y;
                },
                onComplete: () => {
                    // Clean up gem and its shiny glint on chest impact
                    gem.destroy();
                    if (glint && glint.active) glint.destroy();
                    if (aura && aura.active) aura.destroy();

                    this.backpack.addBiomass(amount);
                    this.showFloatingText(this.player.x, this.player.y - 90, `+${amount} Biomass`, "#55ff55", 1800);

                    // 💥 Dopamine Chest Burst on live player position
                    const hitChestX = this.player.x;
                    const hitChestY = this.player.y - (this.player.displayHeight * 0.45);

                    const burst = this.add.circle(hitChestX, hitChestY, 12, 0x00ff88, 0.95);
                    burst.setStrokeStyle(3.5, 0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(collectDepth);
                    this.tweens.add({
                        targets: burst,
                        radius: 44,
                        alpha: 0,
                        duration: 180,
                        ease: "Quad.easeOut",
                        onComplete: () => burst.destroy()
                    });

                    // 💥 Debounced Haptic Shake
                    if (!this.cameras.main.shakeEffect.isRunning) {
                        this.cameras.main.shake(30, 0.001);
                    }
                }
            });
        });
        this.data.set("biomassGroup", this.biomassGroup);

        


        this.trapManager = new TrapManager(this);
        this.waveManager = new WaveManager(this);
        this.createBuildBarUI();

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
                if (success && this.player) {
                    this.physics.world.resume();

                    this.player.hp = 50;
                    this.backpack.updateHP(50, this.player.maxHp);
                    this.player.clearTint();
                    this.player.setAlpha(1.0); // 👈 Guaranteed full visibility!
                    this.player.setVisible(true);

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

                    this.player.triggerReviveShield(3000);
                    this.showFloatingText(this.player.x, this.player.y - 110, "⚡ REVIVED WITH 3s INVULNERABILITY SHIELD!", "#00ffff", 3000);
                }
            });
        });


        
        this.waveManager = new WaveManager(this);

        // =========================================================================
        // 🌾 1. UNIFIED RUSTIC FARMSTEAD YARD (Encloses Both Fields & Workshop!)
        // =========================================================================
        const gridCenterX = spawnX + 110;
        const gridCenterY = spawnY;
        const spacing = 40;

        // 🏡 Elongated organic farmyard (Width 520px x Height 290px covers ALL plots & benches!)
        
        // 🏡 100% Solid Opaque Farmstead Dirt Ground (Zero Grass Bleed-Through!)
        // Rich Peat Loam (#3a2516) with soft natural soil border (#27170c)
        this.farmDirtClearing = this.add.rectangle(spawnX + 30, spawnY + 20, 540, 310, 0x3a2516, 1.0);
        this.farmDirtClearing.setDepth(0);
        this.farmDirtClearing.setStrokeStyle(3, 0x27170c, 0.85);

        // --- SPAWN 3x3 PEPPER FARM & SCARECROW TOTEM (East Wing) ---
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

        // --- SPAWN 3 DEDICATED HERB PLOTS (West Wing inside the Yard!) ---
        const herbStartX = spawnX - 85;
        const herbStartY = spawnY - 40;
        for (let i = 0; i < 3; i++) {
            const isUnlocked = i === 0;
            const hPlot = new HerbPlot(this, herbStartX, herbStartY + (i * 40), isUnlocked);
            this.herbPlots.push(hPlot);
        }

        // --- SPAWN CRAFTING BENCH & SEED COMPOSTER (Workshop South) ---
        this.craftingBench = new CraftingBench(this, spawnX + 10, gridCenterY + 95);
        this.seedComposter = new SeedComposter(this, spawnX + 70, gridCenterY + 95);

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

        // Bullets trigger Barrels / hit Solid Traps
        if (this.trapManager?.solidTrapGroup) {
            this.physics.add.overlap(
                this.projectileGroup,
                this.trapManager.solidTrapGroup,
                (projObj, trapObj) => {
                    const proj = projObj as SeedProjectile;
                    const trapSprite = trapObj as Phaser.GameObjects.Sprite;
                    const trapData = trapSprite?.getData("trapData");
                    if (proj?.active && trapData && trapData.state === "INTACT") {
                        if (trapData.type === "BARREL" && this.waveManager) {
                            this.trapManager.detonateBarrel(trapData, this.waveManager.getActiveZombies());
                        }
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

        // Ghost Previews for Traps
        this.ghostTrapBox = this.add.rectangle(0, 0, 36, 36, 0x55ff55, 0.4);
        this.ghostTrapBox.setStrokeStyle(2, 0x00ff00).setDepth(25000).setVisible(false);

        this.ghostRangeCircle = this.add.circle(0, 0, 180, 0xffaa00, 0.15);
        this.ghostRangeCircle.setStrokeStyle(2, 0xffaa00, 0.8).setDepth(24999).setVisible(false);

        // Scroll Wheel & Number Keys for Trap Switching
        this.input.on("wheel", (_pointer: any, _gameObjects: any, _deltaX: number, deltaY: number) => {
            if (this.isBuildBarOpen && this.backpack) {
                if (deltaY > 0) {
                    this.backpack.activeTrapSlot = this.backpack.activeTrapSlot === 3 ? 1 : ((this.backpack.activeTrapSlot + 1) as any);
                } else {
                    this.backpack.activeTrapSlot = this.backpack.activeTrapSlot === 1 ? 3 : ((this.backpack.activeTrapSlot - 1) as any);
                }
                this.updateBuildBarSlots();
            }
        });

        const key1 = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
        const key2 = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
        const key3 = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);

        key1?.on("down", () => { if (this.isBuildBarOpen) { this.backpack.activeTrapSlot = 1; this.updateBuildBarSlots(); } });
        key2?.on("down", () => { if (this.isBuildBarOpen && this.backpack.isSentryUnlocked) { this.backpack.activeTrapSlot = 2; this.updateBuildBarSlots(); } });
        key3?.on("down", () => { if (this.isBuildBarOpen && this.backpack.isBarrelUnlocked) { this.backpack.activeTrapSlot = 3; this.updateBuildBarSlots(); } });

        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (pointer.y >= 540) return; // 👈 Blocks world placement when clicking bottom HUD/buttons
            if (this.isBuildBarOpen) {
                if (pointer.button === 0 || pointer.leftButtonDown()) {
                    this.handleBuildTrapClick(pointer.worldX, pointer.worldY);
                } else if (pointer.button === 2 || pointer.rightButtonDown()) {
                    this.handleDismantleTrapClick(pointer.worldX, pointer.worldY);
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

        // 🧱 Solid Trap Colliders (Player & Zombies collide with Barrels & Sentries)
        if (this.trapManager && this.trapManager.solidTrapGroup) {
            this.physics.add.collider(this.player, this.trapManager.solidTrapGroup);

            if (this.waveManager && this.waveManager.zombieGroup) {
                this.physics.add.collider(this.waveManager.zombieGroup, this.trapManager.solidTrapGroup, (zombieObj, trapObj) => {
                    const zombie = zombieObj as Zombie;
                    const trapSprite = trapObj as Phaser.GameObjects.Sprite;
                    const trapData = trapSprite.getData("trapData");

                    if (!zombie || !zombie.active || !trapData || trapData.state === "BROKEN") return;

                    // 🧨 Barrel Touched by Zombie -> INSTANT DETONATION
                    if (trapData.type === "BARREL") {
                        this.trapManager.detonateBarrel(trapData, this.waveManager.getActiveZombies());
                    } 
                    // 🎃 Sentry Touched by Zombie -> Zombie chews on Sentry
                    else if (trapData.type === "SENTRY") {
                        const now = this.time.now;
                        if (now - (trapData.lastZombieChewTime || 0) >= 800) {
                            trapData.lastZombieChewTime = now;
                            this.trapManager.damageSentry(trapData, 10);
                        }
                    }
                });
            }
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

        const tabKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
        tabKey?.on("down", () => {
            if (this.backpack) {
                this.backpack.toggleActiveSeed();
                const activeName = this.backpack.activeSeedType === "pepper" ? "🌶️ Pepper Seeds" : "🎃 Pumpkin Seeds";
                this.showFloatingText(this.player.x, this.player.y - 90, `Active Seed: ${activeName}`, "#ffaa00", 1200);
            }
        });


        new DebugManager(this, this.player, this.waveManager, this.backpack, this.farmPlots);

        this.cameras.main.startFollow(this.player);
        this.cameras.main.setZoom(1.25);
        this.cameras.main.roundPixels = true;
        this.cameras.main.setBounds(0, 0, mapSize, mapSize);
        this.physics.world.setBounds(0, 0, mapSize, mapSize);

        // 🌑 Atmospheric Camera Vignette (Soft shadow falloff on screen edges)
        if (this.cameras.main.postFX) {
            this.cameras.main.postFX.addVignette(0.5, 0.5, 0.82, 0.45);
        }

        // Top-Center Wave Banner
        this.waveText = this.add.text(600, 100, "WAVE 0 - PREP PHASE | Press [N] to Start Wave", {
            fontFamily: "Arial",
            fontSize: "14px",
            color: "#ffcc00",
            stroke: "#000000",
            strokeThickness: 4 // 👈 Thick black border so text is readable in Day & Night!
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
        if (this.textures.exists("zombie_walker")) {
            this.textures.get("zombie_walker").setFilter(Phaser.Textures.FilterMode.LINEAR);
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
        this.backpack.pepperSeeds = Math.max(2, this.backpack.pepperSeeds);
        this.player.hp = 100;
        this.backpack.updateHP(100, this.player.maxHp);
        this.player.clearTint();
        this.player.setAlpha(1.0);

        // 🗡️ GUARANTEED PITCHFORK & SHADOW RESTORE ON DEFEAT:
        if (this.player.pitchforkSprite) {
            this.player.pitchforkSprite.setVisible(true);
            this.player.isMeleeSwinging = false;
        }
        if ((this.player as any).groundShadow) {
            (this.player as any).groundShadow.setVisible(true);
        }

        // ☀️ Restore World Colors from Grayscale:
        if (this.cameras.main.postFX) {
            this.cameras.main.postFX.clear();
            this.cameras.main.postFX.addVignette(0.5, 0.5, 0.82, 0.45);
        }

        const spawnX = 3072 / 2;
        const spawnY = 3072 / 2;
        this.player.setPosition(spawnX, spawnY);

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

    public registerRootSpore(spore: Phaser.GameObjects.Arc) {
        this.rootSpores.push(spore);
    }

    update(time: number, delta: number) {
        if (this.player && this.player.active) {
            // 🌟 Sits ABOVE the night overlay so the farmer stays 100% bright & saturated!
            this.player.setDepth(this.player.y); // 👈 Natural Y-Depth sorting!
            this.player.update(delta);
        }

        // 🌿 Instant Root Spore Pickup [Q Charge]
        if (this.rootSpores.length > 0 && this.player) {
            for (let i = this.rootSpores.length - 1; i >= 0; i--) {
                const spore = this.rootSpores[i];
                if (!spore || !spore.active) {
                    this.rootSpores.splice(i, 1);
                    continue;
                }

                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y - 20, spore.x, spore.y);
                if (dist <= 42) {
                    spore.destroy();
                    this.rootSpores.splice(i, 1);

                    this.backpack.addRootCharge(1);
                    this.showFloatingText(this.player.x, this.player.y - 90, "🌿 ROOT SPORE! +1 [Q] READY", "#55ff55", 2500);

                    // Additive green energy burst on player
                    const ring = this.add.circle(this.player.x, this.player.y - 20, 12, 0x33ff66, 0.9);
                    ring.setStrokeStyle(3, 0xaaffaa).setBlendMode(Phaser.BlendModes.ADD).setDepth(25000);
                    this.tweens.add({
                        targets: ring,
                        radius: 65,
                        alpha: 0,
                        duration: 300,
                        ease: "Quad.easeOut",
                        onComplete: () => ring.destroy()
                    });
                }
            }
        }

        this.handleBuildBarToggle();
        if (this.trapManager && this.waveManager) {
            this.trapManager.updateTraps(delta, this.waveManager.getActiveZombies());
        }
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
                                hitTarget = true;
                                break;
                            }
                        }
                    }
                }
                if (hitTarget || !proj.active) continue;

                // D. Hit Solid Traps (Barrels / Sentries)
                if (this.trapManager && this.trapManager.solidTrapGroup) {
                    for (const trapObj of this.trapManager.solidTrapGroup.getChildren()) {
                        const t = trapObj as Phaser.GameObjects.Sprite;
                        const trapData = t.getData("trapData");
                        if (t && t.body && trapData && trapData.state === "INTACT") {
                            const b = t.body as Phaser.Physics.Arcade.StaticBody;
                            if (pBox.right >= b.x && pBox.left <= b.right && pBox.bottom >= b.y && pBox.top <= b.bottom) {
                                if (trapData.type === "BARREL" && this.waveManager) {
                                    this.trapManager.detonateBarrel(trapData, this.waveManager.getActiveZombies());
                                }
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
                this.setNightLighting(false); // 👈 ADD THIS: Forces Day/Morning Sun during Boss Prep!
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
            if (this.seedComposter && !this.seedComposter.isUnlocked && !this.seedComposter.visible) {
                if (typeof (this.seedComposter as any).signalUnlockReady === "function") {
                    this.seedComposter.signalUnlockReady();
                } else {
                    this.seedComposter.setVisible(true).setTint(0xffcc00);
                }
                this.showAct1VictoryModal();
            }
        } else if (this.waveManager.currentWave > 0 && !this.waveManager.isWaveActive) {
            this.setNightLighting(false); // ☀️ Morning sun returns on wave clear
            this.waveText.setText(`WAVE ${this.waveManager.currentWave} CLEARED - PREP PHASE | Press [N] to Start Wave ${this.waveManager.currentWave + 1}`);
            this.waveText.setColor("#55ff55");
        }
            }
        }

        // 🔓 Wave Unlock Gates for Offensive Traps
        if (this.waveManager && this.waveManager.currentWave === 2 && !this.waveManager.isWaveActive && !this.backpack.isBarrelUnlocked) {
            this.backpack.isBarrelUnlocked = true;
            this.showFloatingText(this.player.x, this.player.y - 110, "🧨 PEPPER BARRELS UNLOCKED! [Build Bar: F]", "#ff3300", 4000);
        }

        if (this.waveManager && this.waveManager.currentWave === 3 && !this.waveManager.isWaveActive && !this.hasRewardedPumpkins) {
            this.hasRewardedPumpkins = true;
            this.backpack.isSentryUnlocked = true;
            this.backpack.addPumpkinSeeds(2);
            this.showFloatingText(this.player.x, this.player.y - 110, "🎃 PUMPKIN SENTRY & SEEDS UNLOCKED! [Build Bar: F]", "#ff7700", 4000);
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
            this.scarecrow.showPrompt(waveNum, this.farmPlots, this.backpack.biomassCount);
            return;
        }
        // Farm Plots Check
        for (const plot of this.farmPlots) {
            if (this.isPlayerTouching(plot)) {
                const cost = this.getNextPlotUnlockCost();
                const activeSeed = this.backpack.activeSeedType;
                const seedCount = activeSeed === "pepper" ? this.backpack.pepperSeeds : this.backpack.pumpkinSeeds;
                plot.showPrompt(this.backpack.biomassCount, activeSeed, seedCount, cost);
                return;
            }
        }
        // Herb Plots Check
        for (const hPlot of this.herbPlots) {
            if (this.isPlayerTouching(hPlot)) {
                hPlot.showPrompt(this.backpack.biomassCount, isWaveActive);
                return;
            }
        }

    }

    private handleFarmingInteraction() {
        if (!this.player || !this.player.body || this.isBuildBarOpen) return;

        const isEJustDown = Phaser.Input.Keyboard.JustDown(this.interactKey);
        const isEHeld = this.interactKey.isDown;
        const isUJustDown = Phaser.Input.Keyboard.JustDown(this.upgradeKey);

        if (!isEJustDown && !isEHeld && !isUJustDown) return;

        if (this.waveManager && this.waveManager.isWaveActive) {
            if (isEJustDown) {
                this.showFloatingText(this.player.x, this.player.y - 90, "Farming Locked During Active Wave!", "#ff3333");
            }
            return;
        }

        // =========================================================================
        // 🌾 1. STREAM-PLANTING ENGINE (Hold [E] & Walk across Empty Plots)
        // =========================================================================
        if (isEHeld) {
            for (const plot of this.farmPlots) {
                // Blocks auto-sowing if the plot was just harvested in the same keypress
                if (this.isPlayerTouching(plot) && plot.isUnlocked && plot.state === CropState.EMPTY && plot.harvestsLeft > 0 && this.time.now > plot.lastHarvestTime) {

                    const activeSeed = this.backpack.activeSeedType;
                    if (activeSeed === "pepper" && this.backpack.pepperSeeds > 0) {
                        this.backpack.addPepperSeeds(-1);
                        plot.plantSeed("pepper");
                        this.showFloatingText(plot.x, plot.y - 30, "Pepper Planted! 🌶️", "#55ff55", 800);
                    } else if (activeSeed === "pumpkin" && this.backpack.pumpkinSeeds > 0) {
                        this.backpack.addPumpkinSeeds(-1);
                        plot.plantSeed("pumpkin");
                        this.showFloatingText(plot.x, plot.y - 30, "Pumpkin Planted! 🎃", "#ff7700", 800);
                    }
                }
            }
        }

        // =========================================================================
        // 🔨 2. REBUILD RUINS (Single Tap [E])
        // =========================================================================
        if (isEJustDown && (this as any).fenceManager && (this as any).fenceManager.hasNearbyBrokenRuins(this.player.x, this.player.y)) {
            const rebuilt = (this as any).fenceManager.rebuildNearbyBrokenFences(this.player.x, this.player.y, this.backpack);
            if (rebuilt > 0) {
                this.showFloatingText(this.player.x, this.player.y - 90, `Rebuilt +${rebuilt} Defenses! (-1 Biomass)`, "#55ff55");
                return;
            }
        }

        // =========================================================================
        // 🪵 3. CRAFTING BENCH (Single Tap [E])
        // =========================================================================
        if (this.craftingBench && this.isPlayerTouching(this.craftingBench)) {
            if (isEJustDown) {
                const success = this.craftingBench.craftFence(this.backpack);
                if (success) {
                    this.showFloatingText(this.craftingBench.x, this.craftingBench.y - 30, "+1 Defense Crafted! [Press F to Place]", "#55ff55");
                } else {
                    this.showFloatingText(this.craftingBench.x, this.craftingBench.y - 30, "Need 1 Biomass to Craft!", "#ff5555");
                }
            }
            return;
        }

        // =========================================================================
        // 🌾 4. SEED COMPOSTER (Single Tap [E])
        // =========================================================================
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

        // =========================================================================
        // 👑 5. SCARECROW TOTEM (Single Tap [E] Priority Harvest -> Slurry Pulse)
        // =========================================================================
        if (this.scarecrow && this.isPlayerTouching(this.scarecrow)) {
            if (isEJustDown) {
                // Priority 1: Vacuum Harvest if any crops are ready
                if (this.scarecrow.hasMatureCrops(this.farmPlots)) {
                    const yieldData = this.scarecrow.vacuumHarvestAll(this.farmPlots, this.backpack, this);
                    if (yieldData.totalAmmo > 0 || yieldData.totalSeeds > 0 || yieldData.totalPumpkins > 0) {
                        for (let i = 0; i < yieldData.totalAmmo; i++) {
                            this.backpack.recordHarvest();
                        }

                        const pumpkinStr = yieldData.totalPumpkins > 0 ? ` | +${yieldData.totalPumpkins} Pumpkins` : "";
                        this.showFloatingText(
                            this.scarecrow.x, 
                            this.scarecrow.y - 30, 
                            `+${yieldData.totalAmmo} Ammo | +${yieldData.totalSeeds} Seeds${pumpkinStr}`, 
                            "#ffaa00"
                        );
                    }
                }
                // Priority 2: Slurry Pulse if soil is depleted
                else if (this.scarecrow.getDepletedPlots(this.farmPlots).length > 0) {
                    if (this.backpack.biomassCount > 0) {
                        const refilled = this.scarecrow.slurryPulse(this.farmPlots, this.backpack, this);
                        this.showFloatingText(
                            this.scarecrow.x,
                            this.scarecrow.y - 30,
                            `🌿 Slurry Pulse: Refilled ${refilled} Plot${refilled > 1 ? "s" : ""}! (-${refilled} Biomass)`,
                            "#55ff55",
                            2200
                        );
                    } else {
                        this.showFloatingText(this.scarecrow.x, this.scarecrow.y - 30, "Need Biomass to Refill Soil!", "#ff5555");
                    }
                } else {
                    this.showFloatingText(this.scarecrow.x, this.scarecrow.y - 30, "All Soil is Fresh!", "#ffff55");
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

        // =========================================================================
        // 🌿 6. HERB PLOTS (Single Tap [E])
        // =========================================================================
        for (const hPlot of this.herbPlots) {
            if (this.isPlayerTouching(hPlot)) {
                if (isEJustDown) {
                    if (!hPlot.isUnlocked && this.backpack.biomassCount >= 3) {
                        this.backpack.addBiomass(-3);
                        hPlot.unlockHerbPlot();
                        this.showFloatingText(hPlot.x, hPlot.y - 30, "Herb Bed Unlocked!", "#55ff55");
                    } else if (hPlot.isUnlocked && hPlot.state === HerbState.EMPTY && this.backpack.biomassCount >= 1) {
                        this.backpack.addBiomass(-1);
                        hPlot.plantHerb();
                        this.showFloatingText(hPlot.x, hPlot.y - 30, "Heal Herb Planted! (-1 Biomass)", "#55ff55");
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

        // =========================================================================
        // 🌶️ 7. MANUAL FARM PLOT INTERACTION (Single Tap [E] Unlock / Fertilize / Harvest)
        // =========================================================================
        if (isEJustDown) {
            for (const plot of this.farmPlots) {
                if (this.isPlayerTouching(plot)) {
                    const unlockCost = this.getNextPlotUnlockCost();

                    if (!plot.isUnlocked && this.backpack.biomassCount >= unlockCost) {
                        this.backpack.addBiomass(-unlockCost);
                        plot.unlockPlot();
                        this.showFloatingText(plot.x, plot.y - 30, `Plot Unlocked! (-${unlockCost} Biomass)`, "#55ff55");
                    } else if (plot.isUnlocked && plot.harvestsLeft <= 0 && this.backpack.biomassCount > 0) {
                        this.backpack.addBiomass(-1);
                        plot.fertilizeSoil();
                        this.showFloatingText(plot.x, plot.y - 30, `Soil Fertilized! (${plot.maxHarvests}/${plot.maxHarvests})`, "#55ff55");
                    } else if (plot.isUnlocked && plot.state === CropState.EMPTY && plot.harvestsLeft > 0) {
                        const activeSeed = this.backpack.activeSeedType;
                        if (activeSeed === "pepper" && this.backpack.pepperSeeds > 0) {
                            this.backpack.addPepperSeeds(-1);
                            plot.plantSeed("pepper");
                            this.showFloatingText(plot.x, plot.y - 30, "Pepper Planted! 🌶️", "#55ff55");
                        } else if (activeSeed === "pumpkin" && this.backpack.pumpkinSeeds > 0) {
                            this.backpack.addPumpkinSeeds(-1);
                            plot.plantSeed("pumpkin");
                            this.showFloatingText(plot.x, plot.y - 30, "Pumpkin Planted! 🎃", "#ff7700");
                        } else {
                            this.showFloatingText(plot.x, plot.y - 30, `No ${activeSeed === "pepper" ? "Pepper" : "Pumpkin"} Seeds!`, "#ff5555");
                        }
                    } else if (plot.isUnlocked && plot.state === CropState.MATURE) {
                        const yieldData = plot.harvest();
                        if (yieldData) {
                            if (yieldData.ammo > 0) this.backpack.addPepperAmmo(yieldData.ammo);
                            if (yieldData.seeds > 0) this.backpack.addPepperSeeds(yieldData.seeds);
                            if (yieldData.pumpkins > 0) this.backpack.addIronPumpkins(yieldData.pumpkins);
                            if (yieldData.pumpkinSeeds > 0) this.backpack.addPumpkinSeeds(yieldData.pumpkinSeeds);
                            this.backpack.recordHarvest();
                            
                            const msg = yieldData.pumpkins > 0 
                                ? `+1 Iron Pumpkin | +${yieldData.pumpkinSeeds} Seeds` 
                                : `+${yieldData.ammo} Pepper Ammo | +${yieldData.seeds} Seeds`;
                            this.showFloatingText(plot.x, plot.y - 30, msg, "#ffaa00");
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
        // Handled automatically by native physics overlap callback with 0 CPU overhead!
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
        if (!this.player || this.player.hp <= 0) return;

        const currentTime = this.time.now;
        if (currentTime - this.lastRootBurstTime < 1000) return;

        if (this.backpack.rootCharges <= 0) {
            this.showFloatingText(this.player.x, this.player.y - 90, "No Root Burst Charges! (Harvest Crops)", "#ffaa00");
            return;
        }

        this.backpack.consumeRootCharge();
        this.lastRootBurstTime = currentTime;

        if (this.player && this.player.triggerCombatStance) {
            this.player.triggerCombatStance(500);
        }

        this.triggerHitStop(70);
        this.cameras.main.shake(160, 0.01);

        const aoeRadius = 125;
        const burstDamage = 45;
        const burstX = this.player.x;
        const burstY = this.player.y - 20;

        // =========================================================================
        // 💥 1. ADDITIVE EMERALD SOLAR FLASH & RADIAL SHOCKWAVE
        // =========================================================================
        const shockwave = this.add.circle(burstX, burstY, 16, 0x11aa33, 0.85);
        shockwave.setStrokeStyle(5, 0x88ff44).setBlendMode(Phaser.BlendModes.ADD).setDepth(25002);
        this.tweens.add({
            targets: shockwave,
            radius: aoeRadius,
            alpha: 0,
            duration: 520,
            ease: "Expo.easeOut",
            onComplete: () => shockwave.destroy()
        });

        const coreFlash = this.add.circle(burstX, burstY, 20, 0xffffff, 0.95);
        coreFlash.setBlendMode(Phaser.BlendModes.ADD).setDepth(25003);
        this.tweens.add({
            targets: coreFlash,
            radius: 55,
            alpha: 0,
            duration: 250,
            ease: "Quad.easeOut",
            onComplete: () => coreFlash.destroy()
        });

        // =========================================================================
        // 🌿 2. 8-STREAM WAVING ROOT TENDRILS (Brown ➔ Green Gradient, Zero Gaps!)
        // =========================================================================
        const numBranches = 8;
        const nodesPerBranch = 14; // Seamless overlapping chain

        for (let b = 0; b < numBranches; b++) {
            const baseAngle = (b / numBranches) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.08, 0.08);
            const perpAngle = baseAngle + Math.PI / 2;
            const maxReach = aoeRadius * Phaser.Math.FloatBetween(0.9, 1.05);

            for (let s = 1; s <= nodesPerBranch; s++) {
                const progress = s / nodesPerBranch; // 0 to 1
                const dist = progress * maxReach;

                // 🌊 Wavy sine oscillation along flight vector
                const waveOffset = Math.sin(progress * Math.PI * 2.8) * (14 * (1 - progress * 0.25));
                const nodeX = burstX + Math.cos(baseAngle) * dist + Math.cos(perpAngle) * waveOffset;
                const nodeY = burstY + Math.sin(baseAngle) * dist + Math.sin(perpAngle) * waveOffset;

                // Tapered thickness: thick at root (13px), needle at tip (4px)
                const nodeSize = Phaser.Math.Linear(13, 4, progress);

                // 🎨 4-Tier Brown-to-Emerald Gradient
                let nodeColor = 0x3d2314; // Bark brown base
                if (progress > 0.25 && progress <= 0.55) nodeColor = 0x1e5f18; // Deep moss
                else if (progress > 0.55 && progress <= 0.82) nodeColor = 0x22cc44; // Vivid emerald
                else if (progress > 0.82) nodeColor = 0x99ff33; // Glowing lime tip

                const isTip = progress > 0.80;
                const node = this.add.circle(nodeX, nodeY, nodeSize / 2, nodeColor, isTip ? 1.0 : 0.92);
                if (isTip) node.setBlendMode(Phaser.BlendModes.ADD);
                node.setDepth(nodeY);

                // Staggered surge: Tendril shoots out progressively like a living serpent
                node.setScale(0.2);
                this.tweens.add({
                    targets: node,
                    scale: 1.0,
                    delay: s * 16, // 👈 Staggers expansion outward
                    duration: 180,
                    ease: "Back.easeOut",
                    onComplete: () => {
                        // Lingers visible, then gracefully withers into earth spores
                        this.tweens.add({
                            targets: node,
                            scaleX: 0.2,
                            scaleY: 0.2,
                            alpha: 0,
                            delay: 240,
                            duration: 380,
                            ease: "Quad.easeIn",
                            onComplete: () => node.destroy()
                        });
                    }
                });
            }
        }

        // =========================================================================
        // ✨ 3. SWIRLING NATURE LEAF & SPORE WISPS (Peeling off wave edges)
        // =========================================================================
        for (let l = 0; l < 18; l++) {
            const leafAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const leafDist = Phaser.Math.Between(25, aoeRadius * 0.85);
            const lx = burstX + Math.cos(leafAngle) * leafDist;
            const ly = burstY + Math.sin(leafAngle) * (leafDist * 0.7);

            const leafColor = l % 2 === 0 ? 0x33ff66 : 0xaaff33;
            const leaf = this.add.ellipse(lx, ly, Phaser.Math.Between(7, 11), 3.5, leafColor, 0.95);
            leaf.setRotation(leafAngle).setBlendMode(Phaser.BlendModes.ADD).setDepth(25001);

            this.tweens.add({
                targets: leaf,
                x: lx + Math.cos(leafAngle + 1.0) * Phaser.Math.Between(25, 55),
                y: ly + Math.sin(leafAngle + 1.0) * Phaser.Math.Between(15, 35) - Phaser.Math.Between(25, 50),
                rotation: leafAngle + 3.0,
                scale: 0.1,
                alpha: 0,
                duration: Phaser.Math.Between(850, 1300),
                ease: "Cubic.easeOut",
                onComplete: () => leaf.destroy()
            });
        }

        // =========================================================================
        // 🌿 4. RADIANT GROUND FISSURE DECAL (Depth 2 on Grass)
        // =========================================================================
        const fissureGfx = this.add.graphics().setDepth(2);
        fissureGfx.lineStyle(3, 0x44ee55, 0.65);
        fissureGfx.beginPath();
        for (let f = 0; f < 6; f++) {
            const fAngle = (f / 6) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
            const len = Phaser.Math.Between(30, 60);
            fissureGfx.moveTo(burstX, burstY + 16);
            fissureGfx.lineTo(burstX + Math.cos(fAngle) * (len * 0.5), burstY + 16 + Math.sin(fAngle) * (len * 0.3));
            fissureGfx.lineTo(burstX + Math.cos(fAngle) * len, burstY + 16 + Math.sin(fAngle) * (len * 0.6));
        }
        fissureGfx.strokePath();

        this.tweens.add({
            targets: fissureGfx,
            alpha: 0,
            delay: 400,
            duration: 1600,
            ease: "Quad.easeOut",
            onComplete: () => fissureGfx.destroy()
        });

        this.showFloatingText(burstX, burstY - 60, "🌿 ROOT-BURST CLEAVE!", "#55ff55", 1500);

        // Damage & Knockback to Zombies
        const activeZombies = this.waveManager.getActiveZombies();
        activeZombies.forEach((zombie) => {
            const dist = Phaser.Math.Distance.Between(burstX, burstY, zombie.x, zombie.y - (zombie.displayHeight / 2));
            if (dist <= aoeRadius) {
                const knockbackDir = new Phaser.Math.Vector2(zombie.x - burstX, zombie.y - burstY).normalize();
                zombie.takeDamage(burstDamage, knockbackDir, 360, "MELEE");
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

        // 🌙 Silvery Moonlit Blue (Night) vs ☀️ Warm Golden Morning (Day)
        const targetWorldTint = isNight ? 0x7d94b8 : 0xfff8ee;
        const targetPlayerTint = isNight ? 0x99b3d6 : 0xffffff;

        // 1. Tint Seamless Grass Floor
        if (this.grassFloor) {
            this.grassFloor.setTint(targetWorldTint);
        }

        // Tint player to match ambient moonlight (stops glowing like a sticker)
        if (this.player) {
            this.player.setTint(targetPlayerTint);
            if (this.player.pitchforkSprite) {
                this.player.pitchforkSprite.setTint(targetPlayerTint);
            }
        }

        // 2. Tint Farm Base Dirt Clearing
        if (this.farmDirtClearing) {
            const dirtColor = isNight ? 0x1f140c : 0x3a2516;
            const strokeColor = isNight ? 0x120a06 : 0x27170c;
            this.farmDirtClearing.setFillStyle(dirtColor, 1.0);
            this.farmDirtClearing.setStrokeStyle(3, strokeColor, 0.85);
        }

        // 3. Environment Props (Trees, Rocks, Bushes)
        const propGroups = [this.world.treeBottomGroup, this.world.rockGroup, this.world.bushGroup];
        propGroups.forEach(group => {
            if (group) {
                group.getChildren().forEach((prop: any) => {
                    if (prop && typeof prop.setTint === "function") prop.setTint(targetWorldTint);
                });
            }
        });

        // Farmstead Base Structures
        if (this.scarecrow && typeof this.scarecrow.setTint === "function") {
            this.scarecrow.setTint(isNight ? 0x887755 : 0xffcc44);
        }
        if (this.craftingBench && typeof this.scarecrow.setTint === "function") {
            this.craftingBench.setTint(isNight ? 0x665544 : 0xcc8833);
        }
        if (this.seedComposter && typeof this.seedComposter.setTint === "function") {
            this.seedComposter.setTint(isNight ? 0x334422 : 0x55aa33);
        }
    }

    private createBuildBarUI() {
        const barX = 300;
        const barY = 575;

        const barBg = this.add.rectangle(barX, barY, 320, 48, 0x111a11, 0.95);
        barBg.setStrokeStyle(2, 0x55aa55).setScrollFactor(0).setDepth(29999).setVisible(false);

        const slot1 = this.add.rectangle(barX - 100, barY, 90, 38, 0x223322, 0.9).setStrokeStyle(2, 0xffff00).setScrollFactor(0).setDepth(30000).setVisible(false).setInteractive({ useHandCursor: true });
        const text1 = this.add.text(barX - 100, barY, "[1] 🌵 Spikes\n1 Biomass", { fontFamily: "Arial", fontSize: "10px", align: "center", color: "#ffffff" }).setOrigin(0.5).setScrollFactor(0).setDepth(30001).setVisible(false);

        const slot2 = this.add.rectangle(barX, barY, 90, 38, 0x223322, 0.9).setStrokeStyle(1, 0x888888).setScrollFactor(0).setDepth(30000).setVisible(false).setInteractive({ useHandCursor: true });
        const text2 = this.add.text(barX, barY, "[2] 🎃 Sentry\n2 Bio+1 Pmp", { fontFamily: "Arial", fontSize: "10px", align: "center", color: "#ffffff" }).setOrigin(0.5).setScrollFactor(0).setDepth(30001).setVisible(false);

        const slot3 = this.add.rectangle(barX + 100, barY, 90, 38, 0x223322, 0.9).setStrokeStyle(1, 0x888888).setScrollFactor(0).setDepth(30000).setVisible(false).setInteractive({ useHandCursor: true });
        const text3 = this.add.text(barX + 100, barY, "[3] 🧨 Barrel\n1 Bio+1 Awd", { fontFamily: "Arial", fontSize: "10px", align: "center", color: "#ffffff" }).setOrigin(0.5).setScrollFactor(0).setDepth(30001).setVisible(false);

        slot1.on("pointerdown", () => { this.backpack.activeTrapSlot = 1; this.updateBuildBarSlots(); });
        slot2.on("pointerdown", () => { if (this.backpack.isSentryUnlocked) { this.backpack.activeTrapSlot = 2; this.updateBuildBarSlots(); } });
        slot3.on("pointerdown", () => { if (this.backpack.isBarrelUnlocked) { this.backpack.activeTrapSlot = 3; this.updateBuildBarSlots(); } });

        this.buildBarGroup = [barBg, slot1, text1, slot2, text2, slot3, text3];
    }

    private updateBuildBarSlots() {
        const slot1 = this.buildBarGroup[1] as Phaser.GameObjects.Rectangle;
        const slot2 = this.buildBarGroup[3] as Phaser.GameObjects.Rectangle;
        const slot3 = this.buildBarGroup[5] as Phaser.GameObjects.Rectangle;

        slot1.setStrokeStyle(this.backpack.activeTrapSlot === 1 ? 2 : 1, this.backpack.activeTrapSlot === 1 ? 0xffff00 : 0x55aa55);
        slot2.setStrokeStyle(this.backpack.activeTrapSlot === 2 ? 2 : 1, this.backpack.activeTrapSlot === 2 ? 0xffff00 : (this.backpack.isSentryUnlocked ? 0x55aa55 : 0x555555));
        slot3.setStrokeStyle(this.backpack.activeTrapSlot === 3 ? 2 : 1, this.backpack.activeTrapSlot === 3 ? 0xffff00 : (this.backpack.isBarrelUnlocked ? 0x55aa55 : 0x555555));
    }

    private handleBuildBarToggle() {
        if (!this.player || this.player.hp <= 0) return;

        if (Phaser.Input.Keyboard.JustDown(this.fenceModeKey)) {
            this.isBuildBarOpen = !this.isBuildBarOpen;
            this.buildBarGroup.forEach(el => (el as any).setVisible(this.isBuildBarOpen));
            this.ghostTrapBox.setVisible(this.isBuildBarOpen);
            this.ghostRangeCircle.setVisible(this.isBuildBarOpen && this.backpack.activeTrapSlot === 2);

            if (this.isBuildBarOpen) {
                this.updateBuildBarSlots();
                this.showFloatingText(this.player.x, this.player.y - 90, "Build Bar [F]: [1/2/3] Switch | [L-Click] Place | [R-Click] Refund", "#55ff55");
            } else {
                this.ghostRangeCircle.setVisible(false);
            }
        }

        if (this.isBuildBarOpen) {
            const pointer = this.input.activePointer;
            const gridX = Math.floor(pointer.worldX / 40);
            const gridY = Math.floor(pointer.worldY / 40);
            const snappedX = gridX * 40 + 20;
            const snappedY = gridY * 40 + 20;

            this.ghostTrapBox.setPosition(snappedX, snappedY);
            this.ghostRangeCircle.setPosition(snappedX, snappedY);

            const isSentry = this.backpack.activeTrapSlot === 2;
            this.ghostRangeCircle.setVisible(isSentry);
            this.ghostRangeCircle.setRadius(isSentry ? 180 : 90);

            const isBlocked = this.isTileOccupiedByStructure(snappedX, snappedY);
            const existingTrap = this.trapManager.getTrapAtWorldPos(pointer.worldX, pointer.worldY);

            if (existingTrap || isBlocked) {
                this.ghostTrapBox.setFillStyle(0xff2222, 0.4);
            } else {
                this.ghostTrapBox.setFillStyle(0x55ff55, 0.4);
            }
        }
    }

    private handleBuildTrapClick(worldX: number, worldY: number) {
        const slot = this.backpack.activeTrapSlot;
        const type: TrapType = slot === 1 ? "SPIKES" : (slot === 2 ? "SENTRY" : "BARREL");

        if (type === "SENTRY" && !this.backpack.isSentryUnlocked) {
            this.showFloatingText(worldX, worldY - 20, "Sentry Locked! Clears on Wave 3", "#ffaa00");
            return;
        }
        if (type === "BARREL" && !this.backpack.isBarrelUnlocked) {
            this.showFloatingText(worldX, worldY - 20, "Barrels Locked! Clears on Wave 2", "#ffaa00");
            return;
        }

        const success = this.trapManager.placeTrap(worldX, worldY, type, this.backpack);
        if (success) {
            this.showFloatingText(worldX, worldY - 20, `Placed ${type}!`, "#55ff55");
        } else {
            this.showFloatingText(worldX, worldY - 20, "Cannot place or lacking materials!", "#ff5555");
        }
    }

    private handleDismantleTrapClick(worldX: number, worldY: number) {
        const success = this.trapManager.removeTrap(worldX, worldY, this.backpack);
        if (success) {
            this.showFloatingText(worldX, worldY - 20, "Trap Refunded to Bag!", "#ffaa00");
        }
    }
}