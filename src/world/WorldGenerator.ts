import Phaser from "phaser";

export default class WorldGenerator {
    public treeBottomGroup!: Phaser.Physics.Arcade.StaticGroup;
    public rockGroup!: Phaser.Physics.Arcade.StaticGroup;
    public bushGroup!: Phaser.GameObjects.Group;

    constructor(private scene: Phaser.Scene) {}

    generate(width: number = 3072, height: number = 3072) {
        this.treeBottomGroup = this.scene.physics.add.staticGroup();
        this.rockGroup = this.scene.physics.add.staticGroup();
        this.bushGroup = this.scene.add.group();

        const farmX = width / 2 + 60;
        const farmY = height / 2;

        this.buildOrganicForestBoundary(width, height);
        this.buildWildernessGroves(farmX, farmY);
    }

    private buildOrganicForestBoundary(width: number, height: number) {
        const spacing = 80;

        for (let x = 40; x < width - 40; x += spacing) {
            const jitterX = Phaser.Math.Between(-10, 10);
            this.spawnOrganicTree(x + jitterX, 75);

            const waveY = 145 + Math.sin(x * 0.012) * 25;
            this.spawnOrganicTree(x, waveY);
        }

        for (let x = 40; x < width - 40; x += spacing) {
            const jitterX = Phaser.Math.Between(-10, 10);
            this.spawnOrganicTree(x + jitterX, height - 30);

            const waveY = height - 105 + Math.sin(x * 0.012) * 25;
            this.spawnOrganicTree(x, waveY);
        }

        for (let y = 140; y < height - 140; y += spacing) {
            const jitterY = Phaser.Math.Between(-10, 10);
            this.spawnOrganicTree(50, y + jitterY);

            const waveX = 135 + Math.cos(y * 0.012) * 25;
            this.spawnOrganicTree(waveX, y);
        }

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
            this.spawnOrganicTree(grove.x, grove.y);
            this.spawnOrganicTree(grove.x + 65, grove.y - 25);
            this.spawnOrganicTree(grove.x + 35, grove.y + 40);

            if (grove.hasRock && this.scene.textures.exists("rock")) {
                const rock = this.scene.add.sprite(grove.x + 85, grove.y + 20, "rock");
                rock.setOrigin(0.5, 0.8).setDisplaySize(46, 38).setDepth(grove.y + 20);

                this.scene.physics.add.existing(rock, true);
                const rBody = rock.body as Phaser.Physics.Arcade.StaticBody;
                rBody.setSize(36, 18).setOffset(5, 18).updateFromGameObject();
                this.rockGroup.add(rock);
            }

            if (grove.hasBush && this.scene.textures.exists("bush")) {
                const bush = this.scene.add.sprite(grove.x - 35, grove.y + 25, "bush");
                bush.setOrigin(0.5, 0.7).setDisplaySize(40, 34).setDepth(grove.y + 25);
                this.bushGroup.add(bush);
            }
        });
    }

    public spawnOrganicTree(x: number, y: number) {
        const treeKey = this.scene.textures.exists("tree") ? "tree" : "stump";

        const tree = this.scene.add.sprite(x, y, treeKey);
        tree.setOrigin(0.5, 1.0).setDisplaySize(128, 160).setDepth(y);

        this.scene.physics.add.existing(tree, true);
        const body = tree.body as Phaser.Physics.Arcade.StaticBody;
        body.updateFromGameObject();

        const footW = 45;
        const footH = 20;
        body.setSize(footW, footH).setOffset(32, 140);

        this.treeBottomGroup.add(tree);
    }
}