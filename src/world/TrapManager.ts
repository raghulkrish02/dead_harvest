import Phaser from "phaser";
import Backpack from "../systems/Backpack.ts";
import Zombie from "../enemies/Zombie.ts";

export type TrapType = "SPIKES" | "BARREL" | "SENTRY";

export interface ITrapData {
    id: string;
    type: TrapType;
    gridX: number;
    gridY: number;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    durability: number;
    state: "INTACT" | "BROKEN";
    sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
    solidCollider?: Phaser.Physics.Arcade.Sprite;
    lastAttackTime?: number;
    lastZombieChewTime?: number;
}

export class TrapManager {
    public scene: Phaser.Scene;
    public solidTrapGroup: Phaser.Physics.Arcade.StaticGroup;
    public trapMap: Map<string, ITrapData> = new Map();

    // 🔒 Professional Balance: Max 3 active Sentries
    public readonly MAX_SENTRIES: number = 3;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.solidTrapGroup = scene.physics.add.staticGroup();
    }

    public getActiveSentryCount(): number {
        let count = 0;
        for (const [_, trap] of this.trapMap) {
            if (trap.type === "SENTRY" && trap.state === "INTACT") count++;
        }
        return count;
    }

    public canAffordTrap(type: TrapType, backpack: Backpack): boolean {
        switch (type) {
            case "SPIKES":
                return backpack.biomassCount >= 1;
            case "BARREL":
                return backpack.biomassCount >= 1 && backpack.pepperAmmo >= 1;
            case "SENTRY":
                return backpack.biomassCount >= 2 && backpack.ironPumpkins >= 1 && this.getActiveSentryCount() < this.MAX_SENTRIES;
        }
    }

    public placeTrap(worldX: number, worldY: number, type: TrapType, backpack: Backpack): boolean {
        const gridX = Math.floor(worldX / 40);
        const gridY = Math.floor(worldY / 40);
        const key = `${gridX},${gridY}`;

        if (this.trapMap.has(key)) return false;
        if (!this.canAffordTrap(type, backpack)) return false;

        const snappedX = gridX * 40 + 20;
        const snappedY = gridY * 40 + 20;

        if (type === "SPIKES") {
            backpack.addBiomass(-1);
        } else if (type === "BARREL") {
            backpack.addBiomass(-1);
            backpack.addPepperAmmo(-1);
        } else if (type === "SENTRY") {
            backpack.addBiomass(-2);
            backpack.addIronPumpkins(-1);
        }

        let sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
        let solidCollider: Phaser.Physics.Arcade.Sprite | undefined;

        if (type === "SPIKES") {
            // Walkable floor mat (No solid collider)
            const rect = this.scene.add.rectangle(snappedX, snappedY, 36, 36, 0x4a2e18, 0.9);
            rect.setStrokeStyle(2, 0x2e1a0b).setDepth(2);
            sprite = rect;
        } else if (type === "BARREL") {
            // Solid Red Barrel
            const barrel = this.scene.physics.add.staticSprite(snappedX, snappedY, "stump");
            barrel.setDisplaySize(32, 34).setDepth(snappedY).setTint(0xcc2222);
            barrel.body.setSize(28, 28).updateFromGameObject();
            this.solidTrapGroup.add(barrel);
            sprite = barrel;
            solidCollider = barrel;
        } else {
            // Solid Pumpkin Sentry (75 HP shell)
            const sentry = this.scene.physics.add.staticSprite(snappedX, snappedY, "stump");
            sentry.setDisplaySize(34, 38).setDepth(snappedY).setTint(0xff7700);
            sentry.body.setSize(30, 30).updateFromGameObject();
            this.solidTrapGroup.add(sentry);
            sprite = sentry;
            solidCollider = sentry;
        }

        const trapData: ITrapData = {
            id: key,
            type,
            gridX,
            gridY,
            x: snappedX,
            y: snappedY,
            hp: type === "SENTRY" ? 75 : (type === "BARREL" ? 15 : 100),
            maxHp: type === "SENTRY" ? 75 : (type === "BARREL" ? 15 : 100),
            durability: 10,
            state: "INTACT",
            sprite,
            solidCollider,
            lastAttackTime: 0,
            lastZombieChewTime: 0
        };

        sprite.setData("trapData", trapData);
        if (solidCollider) solidCollider.setData("trapData", trapData);
        this.trapMap.set(key, trapData);
        return true;
    }

    public removeTrap(worldX: number, worldY: number, backpack: Backpack): boolean {
        const gridX = Math.floor(worldX / 40);
        const gridY = Math.floor(worldY / 40);
        const key = `${gridX},${gridY}`;

        const trap = this.trapMap.get(key);
        if (!trap || trap.state === "BROKEN") return false;

        if (trap.type === "SPIKES") backpack.addBiomass(1);
        else if (trap.type === "BARREL") { backpack.addBiomass(1); backpack.addPepperAmmo(1); }
        else if (trap.type === "SENTRY") { backpack.addBiomass(2); backpack.addIronPumpkins(1); }

        if (trap.solidCollider && trap.solidCollider.body) {
            this.solidTrapGroup.remove(trap.solidCollider, true, true);
        } else {
            trap.sprite.destroy();
        }
        this.trapMap.delete(key);
        return true;
    }

    public getTrapAtWorldPos(worldX: number, worldY: number): ITrapData | undefined {
        const gridX = Math.floor(worldX / 40);
        const gridY = Math.floor(worldY / 40);
        return this.trapMap.get(`${gridX},${gridY}`);
    }

    public updateTraps(_delta: number, activeZombies: Zombie[]) {
        const currentTime = this.scene.time.now;

        for (const [_, trap] of this.trapMap) {
            if (trap.state === "BROKEN" || !trap.sprite.active) continue;

            // 🌵 1. REBALANCED BRAMBLE SPIKES (500ms Tick Cadence | 4 DMG per tick | 40% Slow)
            if (trap.type === "SPIKES") {
                for (let i = 0; i < activeZombies.length; i++) {
                    const zombie = activeZombies[i];
                    if (!zombie || !zombie.active) continue;

                    const dx = Math.abs(zombie.x - trap.x);
                    const dy = Math.abs(zombie.y - trap.y);

                    // Step Detection Box
                    if (dx < 18 && dy < 16) {
                        zombie.applySlow(0.60, 600); // 40% movement slow

                        // ⏱️ STRICT 500ms Damage Tick Gating
                        const nextDamageTime = (zombie as any).nextSpikeDamageTime || 0;
                        if (currentTime >= nextDamageTime) {
                            (zombie as any).nextSpikeDamageTime = currentTime + 500;

                            const spikeDamage = 4; // 8 DPS total (4 DMG every 0.5s)
                            const flingDir = new Phaser.Math.Vector2(zombie.x - trap.x, zombie.y - trap.y).normalize();
                            zombie.takeDamage(spikeDamage, flingDir, 40, "MELEE");

                            // Titan Bull Rush Stun
                            if (zombie.zombieType === "TITAN" && (zombie as any).bossState === "CHARGING") {
                                this.triggerTitanTrapStun(zombie, "🌵 SPIKE IMPALEMENT STUN!");
                            }

                            // 1 step consumed from 10-durability reserve
                            trap.durability -= 1.0;
                            if (trap.durability <= 0) {
                                this.breakTrap(trap);
                                break;
                            }
                        }
                    }
                }
            }

            // 🎃 2. REBALANCED IRON PUMPKIN SENTRY (8 DMG every 850ms)
            else if (trap.type === "SENTRY") {
                if (currentTime - (trap.lastAttackTime || 0) >= 850) {
                    let closestZombie: Zombie | null = null;
                    let minDist = 180;

                    for (let i = 0; i < activeZombies.length; i++) {
                        const z = activeZombies[i];
                        if (!z || !z.active) continue;
                        const dist = Phaser.Math.Distance.Between(trap.x, trap.y, z.x, z.y - 20);
                        if (dist < minDist) {
                            minDist = dist;
                            closestZombie = z;
                        }
                    }

                    if (closestZombie) {
                        trap.lastAttackTime = currentTime;
                        this.fireSentrySeed(trap.x, trap.y - 12, closestZombie);
                    }
                }
            }
        }
    }

    private fireSentrySeed(startX: number, startY: number, target: Zombie) {
        const bullet = this.scene.add.circle(startX, startY, 3.5, 0xffaa00);
        bullet.setStrokeStyle(1, 0xffffff).setDepth(startY + 10);

        const targetX = target.x;
        const targetY = target.y - 18;
        const angle = Phaser.Math.Angle.Between(startX, startY, targetX, targetY);
        const dist = Phaser.Math.Distance.Between(startX, startY, targetX, targetY);
        const flightTime = Math.min(500, (dist / 460) * 1000);

        this.scene.tweens.add({
            targets: bullet,
            x: targetX,
            y: targetY,
            duration: flightTime,
            ease: "Linear",
            onComplete: () => {
                bullet.destroy();
                if (target && target.active) {
                    const knockDir = new Phaser.Math.Vector2(Math.cos(angle), Math.sin(angle));
                    // 8 Ranged DMG (Titan Armor reduces this to 4 DMG!)
                    target.takeDamage(8, knockDir, 140, "RANGED");
                }
            }
        });
    }

    public damageSentry(trap: ITrapData, amount: number) {
        if (trap.state === "BROKEN" || trap.type !== "SENTRY") return;

        trap.hp -= amount;
        if (trap.sprite && (trap.sprite as any).setTint) {
            (trap.sprite as any).setTint(0xffffff);
            this.scene.time.delayedCall(80, () => {
                if (trap.sprite.active) (trap.sprite as any).setTint(0xff7700);
            });
        }

        if (trap.hp <= 0) {
            (this.scene as any).showFloatingText?.(trap.x, trap.y - 20, "🎃 Sentry Destroyed!", "#ff3333", 1500);
            this.breakTrap(trap);
        }
    }

    public detonateBarrel(trap: ITrapData, activeZombies: Zombie[]) {
        if (trap.state === "BROKEN" || trap.type !== "BARREL") return;
        trap.state = "BROKEN";

        const aoeRadius = 90;
        const damage = 50;

        this.scene.cameras.main.shake(140, 0.01);

        // Immediate visual burst
        const blastRing = this.scene.add.circle(trap.x, trap.y, 10, 0xff3300, 0.85);
        blastRing.setStrokeStyle(4, 0xffff00).setDepth(25000);
        this.scene.tweens.add({
            targets: blastRing,
            radius: aoeRadius,
            alpha: 0,
            duration: 350,
            ease: "Quad.easeOut",
            onComplete: () => blastRing.destroy()
        });

        // Flame sparks
        for (let i = 0; i < 12; i++) {
            const spark = this.scene.add.circle(trap.x, trap.y, Phaser.Math.Between(3, 6), 0xffaa00);
            spark.setDepth(25000);
            const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const d = Phaser.Math.Between(20, aoeRadius);
            this.scene.tweens.add({
                targets: spark,
                x: trap.x + Math.cos(ang) * d,
                y: trap.y + Math.sin(ang) * d,
                alpha: 0,
                duration: 300,
                onComplete: () => spark.destroy()
            });
        }

        // Damage all zombies in AoE
        activeZombies.forEach((z) => {
            if (!z || !z.active) return;
            const dist = Phaser.Math.Distance.Between(trap.x, trap.y, z.x, z.y - 20);
            if (dist <= aoeRadius) {
                const knockDir = new Phaser.Math.Vector2(z.x - trap.x, z.y - trap.y).normalize();
                z.takeDamage(damage, knockDir, 350, "RANGED");

                if (z.zombieType === "TITAN" && (z as any).bossState === "CHARGING") {
                    this.triggerTitanTrapStun(z, "🧨 BARREL BLAST STUN!");
                }
            }
        });

        // 💥 Turn off solid collider immediately so zombies don't get stuck on ghost air!
        if (trap.solidCollider && trap.solidCollider.body) {
            this.solidTrapGroup.remove(trap.solidCollider, true, true);
        } else {
            trap.sprite.destroy();
        }
        this.trapMap.delete(trap.id);
    }

    private triggerTitanTrapStun(titan: Zombie, msg: string) {
        (titan as any).bossState = "CHASE";
        titan.setVelocity(0, 0);
        titan.setTint(0x00ffff);
        (this.scene as any).showFloatingText?.(titan.x, titan.y - 120, msg, "#00ffff", 2000);

        for (let i = 0; i < 4; i++) {
            const star = this.scene.add.text(titan.x, titan.y - 100, "⭐", { fontSize: "16px" });
            star.setOrigin(0.5).setDepth(30000);
            const ang = (i * Math.PI) / 2;
            this.scene.tweens.add({
                targets: star,
                x: titan.x + Math.cos(ang) * 25,
                y: (titan.y - 100) + Math.sin(ang) * 12,
                duration: 1500,
                yoyo: true,
                onComplete: () => star.destroy()
            });
        }

        this.scene.time.delayedCall(1500, () => {
            if (titan && titan.active) titan.clearTint();
        });
    }

    private breakTrap(trap: ITrapData) {
        trap.state = "BROKEN";
        if (trap.sprite instanceof Phaser.GameObjects.Rectangle) {
            trap.sprite.setFillStyle(0x221105, 0.4);
        } else {
            trap.sprite.setTint(0x332211);
            trap.sprite.setAlpha(0.4);
        }
        if (trap.solidCollider && trap.solidCollider.body) {
            this.solidTrapGroup.remove(trap.solidCollider, false, false);
            trap.solidCollider.body.enable = false;
        }
    }
}