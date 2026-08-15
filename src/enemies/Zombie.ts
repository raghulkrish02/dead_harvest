import Phaser from "phaser";

export default class Zombie extends Phaser.Physics.Arcade.Sprite {
    public hp: number = 30;
    private speed: number = 60;
    public isKnockedBack: boolean = false;
    private playerDamageTimer: number = 0;
    private playerAttackCooldown: number = 1000; // Attacks player every 1 second
    private playerChewDamage: number = 10;        // Deals 10 HP damage per bite


    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y, "player", 0);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setCollideWorldBounds(true);
        this.setTint(0x55aa55);

        this.setOrigin(0.5, 1.0);
        this.setScale(2.5);

        this.body?.setSize(12, 5);
        this.body?.setOffset(9.5, 21);
    }

    // Inside src/enemies/Zombie.ts:

public lastHitSource: "MELEE" | "RANGED" = "MELEE";

public takeDamage(amount: number, knockbackDir: Phaser.Math.Vector2, force: number, source: "MELEE" | "RANGED" = "MELEE") {
    this.lastHitSource = source;
    this.hp -= amount;

    // Flash Red on Hit
    this.setTint(0xff0000);
    this.scene.time.delayedCall(100, () => {
        if (this.active) this.setTint(0x55aa55);
    });

    this.showDamageText(amount);
    this.spawnBloodParticles(knockbackDir);

    this.isKnockedBack = true;
    this.setVelocity(knockbackDir.x * force, knockbackDir.y * force);

    this.scene.time.delayedCall(200, () => {
        this.isKnockedBack = false;
    });

    if (this.hp <= 0) {
        this.dropLoot(this.lastHitSource); // Drops loot based on kill source!
        this.destroy();
    }
}

private dropLoot(source: "MELEE" | "RANGED") {
    // Risk vs Reward: Melee = 60% Drop Rate | Ranged = 40% Drop Rate
    const dropChance = source === "MELEE" ? 0.60 : 0.40;

    if (Math.random() < dropChance) {
        const biomassOrb = this.scene.add.circle(this.x, this.y, 6, 0x55ff55);
        this.scene.physics.add.existing(biomassOrb);

        biomassOrb.setDepth(1);

        const body = biomassOrb.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false);

        biomassOrb.setData("type", "biomass");
        biomassOrb.setData("amount", 1);
    }
}

    private showDamageText(amount: number) {
        const dmgText = this.scene.add.text(
            this.x + Phaser.Math.Between(-8, 8),
            this.y - 12,
            `-${amount}`,
            {
                fontFamily: "Arial",
                fontSize: "14px",
                color: "#ff3333",
                stroke: "#000000",
                strokeThickness: 3,
            }
        )
        .setOrigin(0.5)
        .setDepth(20000);

        this.scene.tweens.add({
            targets: dmgText,
            y: dmgText.y - 20,
            alpha: 0,
            duration: 600,
            ease: "Power2",
            onComplete: () => dmgText.destroy(),
        });
    }

    private spawnBloodParticles(knockbackDir: Phaser.Math.Vector2) {
        for (let i = 0; i < 8; i++) {
            const blood = this.scene.add.circle(this.x, this.y, Phaser.Math.Between(2, 4), 0xaa0000);
            
            const spreadAngle = Phaser.Math.DegToRad(Phaser.Math.Between(-30, 30));
            const sprayVec = knockbackDir.clone().rotate(spreadAngle);
            const speed = Phaser.Math.Between(80, 200);

            this.scene.tweens.add({
                targets: blood,
                x: blood.x + sprayVec.x * (speed / 3),
                y: blood.y + sprayVec.y * (speed / 3),
                alpha: 0,
                scale: 0.2,
                duration: Phaser.Math.Between(200, 400),
                onComplete: () => blood.destroy()
            });
        }
    }

    public update(playerX: number, playerY: number) {
    if (!this.active || this.isKnockedBack) return;

    const distance = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);
    const attackRange = 45;

    if (distance <= attackRange) {
        this.setVelocity(0, 0);

        // CHEW ATTACK PLAYER IF IN RANGE!
        const currentTime = this.scene.time.now;
        if (currentTime > this.playerDamageTimer) {
            const mainScene = this.scene as any;
            if (mainScene.player && mainScene.player.takeDamage) {
                mainScene.player.takeDamage(this.playerChewDamage);
            }
            this.playerDamageTimer = currentTime + this.playerAttackCooldown;
        }
        return;
    }

    const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
    const velocityX = Math.cos(angle) * this.speed;
    const velocityY = Math.sin(angle) * this.speed;

    this.setVelocity(velocityX, velocityY);

    if (velocityX < -5) {
        this.setFlipX(true);
    } else if (velocityX > 5) {
        this.setFlipX(false);
    }
}
}