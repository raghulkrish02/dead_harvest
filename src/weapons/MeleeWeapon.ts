import Phaser from "phaser";
import Zombie from "../enemies/Zombie";

export default class MeleeWeapon {
    private scene: Phaser.Scene;
    private attackCooldown: number = 300;
    private lastAttackTime: number = 0;

    public damage: number = 10;
    public knockbackForce: number = 250;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    public attack(playerX: number, chestY: number, pointer: Phaser.Input.Pointer, backpack?: any, isCombo: boolean = false): boolean {
        const currentTime = this.scene.time.now;
        if (currentTime - this.lastAttackTime < this.attackCooldown) return false;

        // ⚡ Checks 7 Stamina (Clicking) or 12 Stamina (Holding)
        if (backpack && !backpack.consumeMeleeStamina(isHolding)) {
            return false;
        }

        this.lastAttackTime = currentTime;

        const angle = Phaser.Math.Angle.Between(playerX, chestY, pointer.worldX, pointer.worldY);
        const reachDistance = 54;
        const hitboxX = playerX + Math.cos(angle) * reachDistance;
        const hitboxY = chestY + Math.sin(angle) * reachDistance;

        const hitbox = this.scene.add.rectangle(hitboxX, hitboxY, 56, 32, 0xff3333, 0.5);
        hitbox.setRotation(angle);
        hitbox.setDepth(hitboxY);

        const mainScene = this.scene as any;
        if (mainScene.waveManager) {
            const activeZombies: Zombie[] = mainScene.waveManager.getActiveZombies();
            const hitBounds = hitbox.getBounds();

            activeZombies.forEach((zombie) => {
                if (zombie.active && Phaser.Geom.Intersects.RectangleToRectangle(hitBounds, zombie.getBounds())) {
                    const knockbackDir = new Phaser.Math.Vector2(
                        zombie.x - playerX,
                        zombie.y - chestY
                    ).normalize();

                    if (mainScene.triggerHitStop) mainScene.triggerHitStop(50);
                    this.scene.cameras.main.shake(80, 0.004);

                    zombie.takeDamage(this.damage, knockbackDir, this.knockbackForce, "MELEE");
                }
            });
        }

        this.scene.time.delayedCall(80, () => {
            hitbox.destroy();
        });

        this.scene.cameras.main.shake(50, 0.002);
        return true;
    }
}