import Phaser from "phaser";

export default class MeleeWeapon {
    private scene: Phaser.Scene;
    private attackCooldown: number = 300;
    private lastAttackTime: number = 0;

    public damage: number = 10;
    public knockbackForce: number = 250;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    public attack(playerX: number, playerY: number, pointer: Phaser.Input.Pointer) {
        const currentTime = this.scene.time.now;
        if (currentTime - this.lastAttackTime < this.attackCooldown) return;

        this.lastAttackTime = currentTime;

        // 1. Get Mouse World Coordinates in Phaser 3
        const worldX = pointer.worldX;
        const worldY = pointer.worldY;

        // 2. Calculate Angle towards Mouse
        const angle = Phaser.Math.Angle.Between(playerX, playerY, worldX, worldY);
        const directionX = Math.cos(angle);
        const directionY = Math.sin(angle);

        // 3. Position the Attack Hitbox in front of player towards mouse
        const reachDistance = 28;
        const hitboxX = playerX + directionX * reachDistance;
        const hitboxY = playerY + directionY * reachDistance;

        // 4. Create visual slash shape
        const hitbox = this.scene.add.rectangle(hitboxX, hitboxY, 32, 16, 0xff3333, 0.7);
        hitbox.setRotation(angle);

        // Enable physics on hitbox
        this.scene.physics.add.existing(hitbox);
        const body = hitbox.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false);

        // 5. Destroy hitbox after 100ms swing duration
        this.scene.time.delayedCall(100, () => {
            hitbox.destroy();
        });

        // 6. Camera micro-shake on swing
        this.scene.cameras.main.shake(60, 0.002);
    }
}