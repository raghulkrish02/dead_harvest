// Location: src/world/WorldGenerator.ts

import Phaser from "phaser";

export default class WorldGenerator {
    public map!: Phaser.Tilemaps.Tilemap;
    public treeBottomGroup!: Phaser.Physics.Arcade.StaticGroup;
    public rockGroup!: Phaser.Physics.Arcade.StaticGroup;

    public bushGroup!: Phaser.GameObjects.Group;

    constructor(private scene: Phaser.Scene) {}

    generate(): Phaser.Tilemaps.Tilemap {
        this.map = this.scene.make.tilemap({ key: "map" });

        const loadedTilesets: Phaser.Tilemaps.Tileset[] = [];
        const tilesetKeys = [
            "grass_tile",
            "dirt_tile",
            "plowed_dirt",
            "tree",
            "rock",
            "bush",
            "stump"
        ];

        tilesetKeys.forEach((key) => {
            if (this.scene.textures.exists(key)) {
                const ts = this.map.addTilesetImage(key, key);
                if (ts) loadedTilesets.push(ts);
            }
        });

        // 1. Render Ground Tile Layer
        if (this.map.getLayer("ground")) {
            this.map.createLayer("ground", loadedTilesets, 0, 0);
        }
        if (this.map.getLayer("decoration")) {
            this.map.createLayer("decoration", loadedTilesets, 0, 0);
        }

        // 2. Physics Groups
        this.treeBottomGroup = this.scene.physics.add.staticGroup();
        this.rockGroup = this.scene.physics.add.staticGroup();
        this.bushGroup = this.scene.add.group();

        const worldW = this.map.widthInPixels || 3072;
        const worldH = this.map.heightInPixels || 3072;

        const spawnObj = this.map.findObject("objects", (obj) => obj.name === "PlayerSpawn");
        const farmX = (spawnObj?.x ?? (worldW / 2)) + 60;
        const farmY = spawnObj?.y ?? (worldH / 2);

        // 3. 🌲 BUILD DENSE ORGANIC FOREST BORDER (Continuous Canopy)
        this.buildOrganicForestBoundary(worldW, worldH);

        // 4. 🌳 SCATTER 4 CORNER GROVES (Trees + Rocks + Bushes)
        this.buildWildernessGroves(farmX, farmY);

        return this.map;
    }

    private buildOrganicForestBoundary(width: number, height: number) {
        const spacing = 80; // 80px spacing with 128px trees = rich, continuous canopy!

        // TOP FOREST BORDER (Deep Back Layer + Organic Wavy Front Treeline)
        for (let x = 40; x < width - 40; x += spacing) {
            const jitterX = Phaser.Math.Between(-10, 10);
            this.spawnOrganicTree(x + jitterX, 75);

            const waveY = 145 + Math.sin(x * 0.012) * 25;
            this.spawnOrganicTree(x, waveY);
        }

        // BOTTOM FOREST BORDER
        for (let x = 40; x < width - 40; x += spacing) {
            const jitterX = Phaser.Math.Between(-10, 10);
            this.spawnOrganicTree(x + jitterX, height - 30);

            const waveY = height - 105 + Math.sin(x * 0.012) * 25;
            this.spawnOrganicTree(x, waveY);
        }

        // LEFT FOREST BORDER
        for (let y = 140; y < height - 140; y += spacing) {
            const jitterY = Phaser.Math.Between(-10, 10);
            this.spawnOrganicTree(50, y + jitterY);

            const waveX = 135 + Math.cos(y * 0.012) * 25;
            this.spawnOrganicTree(waveX, y);
        }

        // RIGHT FOREST BORDER
        for (let y = 140; y < height - 140; y += spacing) {
            const jitterY = Phaser.Math.Between(-10, 10);
            this.spawnOrganicTree(width - 50, y + jitterY);

            const waveX = width - 135 + Math.cos(y * 0.012) * 25;
            this.spawnOrganicTree(waveX, y);
        }
    }

    private buildWildernessGroves(farmX: number, farmY: number) {
        const groveLocations = [
            { x: farmX - 420, y: farmY - 320, hasRock: true, hasBush: false },
            { x: farmX + 460, y: farmY - 300, hasRock: false, hasBush: true },
            { x: farmX - 440, y: farmY + 340, hasRock: false, hasBush: true },
            { x: farmX + 450, y: farmY + 330, hasRock: true, hasBush: false },
        ];

        groveLocations.forEach(grove => {
            // Cluster of 3 organic trees
            this.spawnOrganicTree(grove.x, grove.y);
            this.spawnOrganicTree(grove.x + 65, grove.y - 25);
            this.spawnOrganicTree(grove.x + 35, grove.y + 40);

            // Solid Rock
            if (grove.hasRock && this.scene.textures.exists("rock")) {
                const rock = this.scene.add.sprite(grove.x + 85, grove.y + 20, "rock");
                rock.setOrigin(0.5, 0.8);
                rock.setDisplaySize(46, 38);
                rock.setDepth(grove.y + 20);

                this.scene.physics.add.existing(rock, true);
                const rBody = rock.body as Phaser.Physics.Arcade.StaticBody;
                rBody.setSize(36, 18);
                rBody.setOffset(5, 18);
                rBody.updateFromGameObject();
                this.rockGroup.add(rock);
            }

            // Tactical Bush
            if (grove.hasBush && this.scene.textures.exists("bush")) {
                 const bush = this.scene.add.sprite(grove.x - 35, grove.y + 25, "bush");
                bush.setOrigin(0.5, 0.7).setDisplaySize(40, 34).setDepth(grove.y + 25); // 👈 Cleaned up
                this.bushGroup.add(bush);
            }
        });
    }

    public spawnOrganicTree(x: number, y: number) {
        const treeKey = this.scene.textures.exists("tree") ? "tree" : "stump";

        // 1. Single Tree Sprite (Canopy renders over characters naturally via Y-Depth)
        const tree = this.scene.add.sprite(x, y, treeKey);
        tree.setOrigin(0.5, 1.0);
        tree.setDisplaySize(128, 160);
        tree.setDepth(y);

        // 2. Solid Root Base (Collides with Player, Zombies & Bullets hitting wood roots)
        this.scene.physics.add.existing(tree, true);
        const body = tree.body as Phaser.Physics.Arcade.StaticBody;
        body.updateFromGameObject();

        const footW = 45;
        const footH = 20;
        body.setSize(footW, footH);
        body.setOffset(32, 140); // Your tuned root offset

        this.treeBottomGroup.add(tree);
    }
}