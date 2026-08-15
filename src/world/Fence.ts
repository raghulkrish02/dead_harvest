import Phaser from "phaser";
import Backpack from "../systems/Backpack";

export interface IFenceData {
    id: string;
    gridX: number;
    gridY: number;
    hp: number;
    maxHp: number;
    tier: number;
    state: "INTACT" | "BROKEN";
    sprite: Phaser.GameObjects.Sprite;
}

export class FenceManager {
    public fenceGroup: Phaser.Physics.Arcade.StaticGroup;
    private fenceMap: Map<string, IFenceData> = new Map();
    private scene: Phaser.Scene;
    private promptText: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.fenceGroup = scene.physics.add.staticGroup();

        this.promptText = scene.add.text(0, 0, "", {
            fontFamily: "Arial",
            fontSize: "11px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(20000);
    }

    public hasIntactFenceAt(gridX: number, gridY: number): boolean {
        const fence = this.fenceMap.get(`${gridX},${gridY}`);
        return !!fence && fence.state === "INTACT";
    }

    public placeFence(worldX: number, worldY: number, tier: number = 1): boolean {
        const gridX = Math.floor(worldX / 40);
        const gridY = Math.floor(worldY / 40);
        const key = `${gridX},${gridY}`;

        const existing = this.fenceMap.get(key);
        if (existing && existing.state === "INTACT") return false;

        const snappedX = gridX * 40 + 20;
        const snappedY = gridY * 40 + 20;

        if (existing && existing.state === "BROKEN") {
            existing.state = "INTACT";
            existing.hp = existing.maxHp;
            existing.sprite.setTint(0x8b5a2b);
            existing.sprite.setAlpha(1.0);

            // Re-enable solid physics collision!
            if (existing.sprite.body) {
                existing.sprite.body.enable = true;
                (existing.sprite.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
            }
            return true;
        }

        const sprite = this.scene.add.sprite(snappedX, snappedY, "stump");
        sprite.setOrigin(0.5, 0.5);
        sprite.setDisplaySize(36, 36);
        sprite.setDepth(snappedY);
        sprite.setTint(0x8b5a2b);

        // Enable solid Arcade Physics static body on fence
        this.scene.physics.add.existing(sprite, true);
        const body = sprite.body as Phaser.Physics.Arcade.StaticBody;
        body.setSize(36, 36);
        body.updateFromGameObject();

        this.fenceGroup.add(sprite);

        const fenceData: IFenceData = {
            id: key,
            gridX,
            gridY,
            hp: 100,
            maxHp: 100,
            tier,
            state: "INTACT",
            sprite
        };

        this.fenceMap.set(key, fenceData);
        return true;
    }

    public removeFence(worldX: number, worldY: number): boolean {
        const gridX = Math.floor(worldX / 40);
        const gridY = Math.floor(worldY / 40);
        const key = `${gridX},${gridY}`;

        const fence = this.fenceMap.get(key);
        if (!fence) return false;

        // Remove solid physics collision
        if (fence.sprite.body) {
            this.fenceGroup.remove(fence.sprite);
        }
        fence.sprite.destroy();
        this.fenceMap.delete(key);
        return true;
    }

    public getFenceAtWorldPos(worldX: number, worldY: number): IFenceData | undefined {
        const gridX = Math.floor(worldX / 40);
        const gridY = Math.floor(worldY / 40);
        return this.fenceMap.get(`${gridX},${gridY}`);
    }

    public damageFence(gridX: number, gridY: number, damage: number): boolean {
        const key = `${gridX},${gridY}`;
        const fence = this.fenceMap.get(key);
        if (!fence || fence.state === "BROKEN") return false;

        fence.hp -= damage;
        
        this.scene.tweens.add({
            targets: fence.sprite,
            alpha: 0.4,
            duration: 60,
            yoyo: true
        });

        // When destroyed: Disable solid collision so entities walk over ruins!
        if (fence.hp <= 0) {
            fence.state = "BROKEN";
            fence.sprite.setTint(0x332211);
            fence.sprite.setAlpha(0.4);

            if (fence.sprite.body) {
                fence.sprite.body.enable = false; // Disable collision!
            }
            return true;
        }
        return false;
    }

    public rebuildNearbyBrokenFences(playerX: number, playerY: number, backpack: Backpack): number {
        if (backpack.biomassCount < 1) return 0;

        let rebuiltCount = 0;

        this.fenceMap.forEach((fence) => {
            if (rebuiltCount >= 3) return;

            if (fence.state === "BROKEN") {
                const worldX = fence.gridX * 40 + 20;
                const worldY = fence.gridY * 40 + 20;
                const dist = Phaser.Math.Distance.Between(playerX, playerY, worldX, worldY);

                if (dist <= 80) {
                    fence.state = "INTACT";
                    fence.hp = fence.maxHp;
                    fence.sprite.setTint(0x8b5a2b);
                    fence.sprite.setAlpha(1.0);

                    // Re-enable solid collision!
                    if (fence.sprite.body) {
                        fence.sprite.body.enable = true;
                        (fence.sprite.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
                    }
                    rebuiltCount++;
                }
            }
        });

        if (rebuiltCount > 0) {
            backpack.addBiomass(-1);
        }

        return rebuiltCount;
    }

    public showRuinsPrompt(playerX: number, playerY: number, biomassCount: number, isWaveActive: boolean) {
        if (isWaveActive) {
            this.promptText.setText("Repairs Locked During Wave!");
            this.promptText.setColor("#ff3333");
            return;
        }

        let closestBroken: IFenceData | null = null;
        let minDist = 80;
        let brokenCount = 0;

        this.fenceMap.forEach((fence) => {
            if (fence.state === "BROKEN") {
                const worldX = fence.gridX * 40 + 20;
                const worldY = fence.gridY * 40 + 20;
                const dist = Phaser.Math.Distance.Between(playerX, playerY, worldX, worldY);

                if (dist <= 80) {
                    brokenCount++;
                    if (dist < minDist) {
                        minDist = dist;
                        closestBroken = fence;
                    }
                }
            }
        });

        if (closestBroken) {
            const countToRepair = Math.min(3, brokenCount);
            const targetX = (closestBroken as IFenceData).gridX * 40 + 20;
            const targetY = (closestBroken as IFenceData).gridY * 40 + 20;

            this.promptText.setPosition(targetX, targetY - 25);
            if (biomassCount >= 1) {
                this.promptText.setText(`Press [E] Rebuild ${countToRepair} Fence${countToRepair > 1 ? "s" : ""} (1 Biomass)`);
                this.promptText.setColor("#55ff55");
            } else {
                this.promptText.setText("Need 1 Biomass to Rebuild!");
                this.promptText.setColor("#ff5555");
            }
        } else {
            this.promptText.setText("");
        }
    }

    public hidePrompt() {
        this.promptText.setText("");
    }

    public hasNearbyBrokenRuins(playerX: number, playerY: number): boolean {
        for (const [_, fence] of this.fenceMap) {
            if (fence.state === "BROKEN") {
                const worldX = fence.gridX * 40 + 20;
                const worldY = fence.gridY * 40 + 20;
                if (Phaser.Math.Distance.Between(playerX, playerY, worldX, worldY) <= 80) {
                    return true;
                }
            }
        }
        return false;
    }
}