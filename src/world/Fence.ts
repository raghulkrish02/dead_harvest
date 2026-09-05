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
        if (existing) return false;

        const snappedX = gridX * 40 + 20;
        const snappedY = gridY * 40 + 20;

        const sprite = this.scene.add.sprite(snappedX, snappedY, "stump");
        sprite.setOrigin(0.5, 0.5);
        sprite.setDisplaySize(36, 36);
        sprite.setDepth(snappedY);
        sprite.setTint(0x8b5a2b);

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

        // Attach fenceData to sprite for direct collider callback access
        sprite.setData("fenceData", fenceData);

        this.fenceMap.set(key, fenceData);
        return true;
    }

    public removeFence(worldX: number, worldY: number): boolean {
        const gridX = Math.floor(worldX / 40);
        const gridY = Math.floor(worldY / 40);
        const key = `${gridX},${gridY}`;

        const fence = this.fenceMap.get(key);
        // BLOCK removing broken ruins: Only INTACT working fences can be dismantled!
        if (!fence || fence.state === "BROKEN") return false;

        if (fence.sprite.body) {
            this.fenceGroup.remove(fence.sprite);
        }
        fence.sprite.destroy();
        this.fenceMap.delete(key);
        return true;
    }

    public getNearbyIntactFence(worldX: number, worldY: number, reach: number = 36): IFenceData | null {
        for (const [_, fence] of this.fenceMap) {
            if (fence.state === "INTACT") {
                const fenceCenterX = fence.gridX * 40 + 20;
                const fenceCenterY = fence.gridY * 40 + 20;
                if (Phaser.Math.Distance.Between(worldX, worldY, fenceCenterX, fenceCenterY) <= reach) {
                    return fence;
                }
            }
        }
        return null;
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
        
        // Visual hit flash
        this.scene.tweens.add({
            targets: fence.sprite,
            alpha: 0.3,
            duration: 60,
            yoyo: true
        });

        // Floating damage indicator on fence
        const fenceWorldX = fence.gridX * 40 + 20;
        const fenceWorldY = fence.gridY * 40 + 20;
        const dmgText = this.scene.add.text(
            fenceWorldX + Phaser.Math.Between(-6, 6),
            fenceWorldY - 10,
            `-${damage}`,
            {
                fontFamily: "Arial",
                fontSize: "11px",
                color: "#ffaa00",
                stroke: "#000000",
                strokeThickness: 3
            }
        ).setOrigin(0.5).setDepth(20000);

        this.scene.tweens.add({
            targets: dmgText,
            y: dmgText.y - 16,
            alpha: 0,
            duration: 400,
            onComplete: () => dmgText.destroy()
        });

        if (fence.hp <= 0) {
            fence.state = "BROKEN";
            fence.sprite.setTint(0x332211);
            fence.sprite.setAlpha(0.4);

            if (fence.sprite.body) {
                fence.sprite.body.enable = false; // Disable collider so zombies walk through
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

    public findSmartPathOrFence(
        zombieX: number,
        zombieY: number,
        playerX: number,
        playerY: number,
        maxDetourTiles: number = 8 // 👈 Scans up to 8 tiles (320px) in both directions!
    ): { gap?: { x: number; y: number }; blockingFence?: IFenceData } {
        const startGridX = Math.floor(zombieX / 40);
        const startGridY = Math.floor(zombieY / 40);
        const targetGridX = Math.floor(playerX / 40);
        const targetGridY = Math.floor(playerY / 40);

        // 1. Raycast line of sight from Zombie to Player to find blocking fence
        let blockingFence: IFenceData | undefined;
        const steps = Math.max(Math.abs(targetGridX - startGridX), Math.abs(targetGridY - startGridY));

        for (let i = 1; i <= Math.min(steps, 10); i++) {
            const t = i / steps;
            const checkX = Math.round(startGridX + (targetGridX - startGridX) * t);
            const checkY = Math.round(startGridY + (targetGridY - startGridY) * t);

            const fence = this.fenceMap.get(`${checkX},${checkY}`);
            if (fence && fence.state === "INTACT") {
                blockingFence = fence;
                break;
            }
        }

        // Direct path to player is clear!
        if (!blockingFence) {
            return {};
        }

        // 2. Search for the nearest opening along the fence line (8 tiles left & right)
        const isHorizontalWall = Math.abs(playerY - zombieY) > Math.abs(playerX - zombieX);
        let closestGap: { x: number; y: number } | undefined;
        let shortestDist = Infinity;

        for (let offset = 1; offset <= maxDetourTiles; offset++) {
            const checkOffsets = [offset, -offset];

            for (const off of checkOffsets) {
                const gx = isHorizontalWall ? blockingFence.gridX + off : blockingFence.gridX;
                const gy = isHorizontalWall ? blockingFence.gridY : blockingFence.gridY + off;

                // Found an open tile with NO intact fence!
                if (!this.hasIntactFenceAt(gx, gy)) {
                    const worldGapX = gx * 40 + 20;
                    const worldGapY = gy * 40 + 20;

                    // Add a step past the fence line towards the player so zombie walks THROUGH
                    const stepX = isHorizontalWall ? worldGapX : worldGapX + (playerX > zombieX ? 32 : -32);
                    const stepY = isHorizontalWall ? worldGapY + (playerY > zombieY ? 32 : -32) : worldGapY;

                    const dist = Phaser.Math.Distance.Between(zombieX, zombieY, stepX, stepY);

                    if (dist < shortestDist) {
                        shortestDist = dist;
                        closestGap = { x: stepX, y: stepY };
                    }
                }
            }

            if (closestGap) break; // Pick closest gap on this search radius
        }

        if (closestGap) {
            return { gap: closestGap };
        }

        // No opening found within 8 tiles -> Must chew blocking fence!
        return { blockingFence };
    }
}