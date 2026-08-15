import Phaser from "phaser";

export default class WorldGenerator {
    public map!: Phaser.Tilemaps.Tilemap;
    public treeBottomLayer!: Phaser.Tilemaps.TilemapLayer | null;
    public treeTopLayer!: Phaser.Tilemaps.TilemapLayer | null;
    public treeBottomGroup!: Phaser.Physics.Arcade.StaticGroup;

    constructor(private scene: Phaser.Scene) {}

    generate(): Phaser.Tilemaps.Tilemap {
        this.map = this.scene.make.tilemap({ key: "map" });

        const loadedTilesets: Phaser.Tilemaps.Tileset[] = [];
        const tilesetKeys = [
            "grass_tile",
            "dirt_tile",
            "plowed_dirt",
            "tree_bottom",
            "tree_top",
            "rock",
            "bush",
            "stump",
            "props",
            "exterior"
        ];

        tilesetKeys.forEach((key) => {
            if (this.scene.textures.exists(key)) {
                const ts = this.map.addTilesetImage(key, key);
                if (ts) loadedTilesets.push(ts);
            }
        });

        this.map.tilesets.forEach((tiledTs) => {
            if (this.scene.textures.exists(tiledTs.name)) {
                const ts = this.map.addTilesetImage(tiledTs.name, tiledTs.name);
                if (ts && !loadedTilesets.includes(ts)) {
                    loadedTilesets.push(ts);
                }
            }
        });

        // 1. Render Ground & Decoration Tile Layers
        this.map.createLayer("ground", loadedTilesets, 0, 0);
        this.map.createLayer("decoration", loadedTilesets, 0, 0);

        // 2. Render Tree Bottoms (Trunks & Collisions)
        this.treeBottomGroup = this.scene.physics.add.staticGroup();
        this.treeBottomLayer = this.map.createLayer("tree_bottom", loadedTilesets, 0, 0);

        if (this.treeBottomLayer) {
            this.treeBottomLayer.setCollisionByExclusion([-1]);
        } else {
            const bottomObjs = this.map.getObjectLayer("tree_bottom")?.objects || [];
            const topObjs = this.map.getObjectLayer("tree_top")?.objects || [];

            bottomObjs.forEach((trunkObj) => {
                const key = this.scene.textures.exists("tree_bottom") ? "tree_bottom" : "props";
                if (this.scene.textures.exists(key)) {
                    const trunk = this.scene.add.sprite(trunkObj.x!, trunkObj.y!, key);
                    
                    // Tiled GID Object origin is bottom-left (0, 1)
                    trunk.setOrigin(0, 1.0);
                    if (trunkObj.width && trunkObj.height) trunk.setDisplaySize(trunkObj.width, trunkObj.height);

                    // TRUNK DEPTH = Root Y position on ground
                    const rootY = trunkObj.y!;
                    trunk.setDepth(rootY);

                    this.scene.physics.add.existing(trunk, true);

                    const body = trunk.body as Phaser.Physics.Arcade.StaticBody;
                    const rootWidth = 40;
                    const rootHeight = 20;
                    const offsetX = (trunk.displayWidth - rootWidth) / 2;
                    const offsetY = trunk.displayHeight - rootHeight;

                    body.setSize(rootWidth, rootHeight);
                    body.setOffset(offsetX, offsetY);
                    body.updateFromGameObject();

                    this.treeBottomGroup.add(trunk);

                    // MATCH CANOPY TO TRUNK: Find matching canopy nearby
                    const matchingCanopy = topObjs.find(c => Math.abs(c.x! - trunkObj.x!) < 150 && Math.abs(c.y! - trunkObj.y!) < 150);
                    if (matchingCanopy) {
                        const canopyKey = this.scene.textures.exists("tree_top") ? "tree_top" : "props";
                        if (this.scene.textures.exists(canopyKey)) {
                            const canopy = this.scene.add.sprite(matchingCanopy.x!, matchingCanopy.y!, canopyKey);
                            canopy.setOrigin(0, 1.0);
                            if (matchingCanopy.width && matchingCanopy.height) {
                                canopy.setDisplaySize(matchingCanopy.width, matchingCanopy.height);
                            }

                            // FORCE CANOPY TO SHARE TRUNK'S ROOT Y DEPTH (+0.01 so leaves render over trunk)
                            canopy.setDepth(rootY + 0.01);
                        }
                    }
                }
            });
        }

        return this.map;
    }
}