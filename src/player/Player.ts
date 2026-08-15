import Phaser from "phaser";
import MeleeWeapon from "../weapons/MeleeWeapon.ts";
import SeedShooter from "../weapons/SeedShooter.ts";

export default class Player extends Phaser.Physics.Arcade.Sprite {
    private speed = 160;
    public hp: number = 100;
    public maxHp: number = 100;

    public weapon!: MeleeWeapon;
    public seedShooter!: SeedShooter;
    private keys!: {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
    };

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y, "player", 0);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.setCollideWorldBounds(true);
        this.setOrigin(0.5, 1.0);
        this.setScale(2.5);

        this.body?.setSize(12, 5);
        this.body?.setOffset(9.5, 21);

        this.weapon = new MeleeWeapon(scene);
        this.seedShooter = new SeedShooter(scene);

        this.createAnimations(scene);

        scene.input.mouse?.disableContextMenu();

        const spaceKey = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        const mainScene = this.scene as any;

        // GOD MECHANISM: If player is in Fence Build Mode, DO NOT ATTACK!
        if (mainScene.isPlacingFence) return;

        const chestY = this.y - (this.displayHeight / 2);
        const isRightClick = pointer.button === 2 || (pointer.event && pointer.event.button === 2);

        if (isRightClick) {
            this.fireSeedShooter(chestY, pointer);
        } else if (pointer.button === 0 || pointer.leftButtonDown()) {
            this.weapon.attack(this.x, chestY, pointer);
        }
    });

        spaceKey?.on("down", () => {
            const chestY = this.y - (this.displayHeight / 2);
            const pointer = scene.input.activePointer;
            this.fireSeedShooter(chestY, pointer);
        });

        this.initInputs(scene);
    }

    public takeDamage(amount: number) {
        if (this.hp <= 0) return;

        this.hp = Math.max(0, this.hp - amount);

        // Update External Top-Left HP Bar!
        const mainScene = this.scene as any;
        if (mainScene.backpack) {
            mainScene.backpack.updateHP(this.hp, this.maxHp);
        }

        this.setTint(0xff0000);
        this.scene.time.delayedCall(100, () => {
            if (this.active) this.clearTint();
        });

        this.scene.cameras.main.shake(80, 0.004);

        const popup = this.scene.add.text(this.x, this.y - 40, `-${amount} HP`, {
            fontFamily: "Arial",
            fontSize: "14px",
            color: "#ff3333",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(20000);

        this.scene.tweens.add({
            targets: popup,
            y: popup.y - 20,
            alpha: 0,
            duration: 600,
            onComplete: () => popup.destroy()
        });

        if (this.hp <= 0) {
            if (mainScene.onPlayerDeath) {
                mainScene.onPlayerDeath();
            }
        }
    }

    public heal(amount: number) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
        const mainScene = this.scene as any;
        if (mainScene.backpack) {
            mainScene.backpack.updateHP(this.hp, this.maxHp);
        }
    }

    private fireSeedShooter(chestY: number, pointer: Phaser.Input.Pointer) {
        const mainScene = this.scene as any;
        if (mainScene.backpack) {
            const projectile = this.seedShooter.shoot(this.x, chestY, pointer, mainScene.backpack);
            if (projectile && mainScene.registerProjectile) {
                mainScene.registerProjectile(projectile);
            }
        }
    }

    private createAnimations(scene: Phaser.Scene) {
        if (!scene.anims || scene.anims.exists("walk-down")) return;

        try {
            scene.anims.create({
                key: "walk-down",
                frames: scene.anims.generateFrameNumbers("player", { start: 18, end: 23 }),
                frameRate: 10,
                repeat: -1,
            });

            scene.anims.create({
                key: "walk-right",
                frames: scene.anims.generateFrameNumbers("player", { start: 24, end: 29 }),
                frameRate: 10,
                repeat: -1,
            });

            scene.anims.create({
                key: "walk-up",
                frames: scene.anims.generateFrameNumbers("player", { start: 30, end: 35 }),
                frameRate: 10,
                repeat: -1,
            });

            scene.anims.create({
                key: "idle-down",
                frames: scene.anims.generateFrameNumbers("player", { start: 0, end: 5 }),
                frameRate: 6,
                repeat: -1,
            });
        } catch (e) {
            console.warn("Player texture not ready, skipping anim creation.");
        }
    }

    private initInputs(scene: Phaser.Scene) {
        this.keys = scene.input.keyboard!.addKeys({
            W: Phaser.Input.Keyboard.KeyCodes.W,
            A: Phaser.Input.Keyboard.KeyCodes.A,
            S: Phaser.Input.Keyboard.KeyCodes.S,
            D: Phaser.Input.Keyboard.KeyCodes.D,
        }) as {
            W: Phaser.Input.Keyboard.Key;
            A: Phaser.Input.Keyboard.Key;
            S: Phaser.Input.Keyboard.Key;
            D: Phaser.Input.Keyboard.Key;
        };
    }

    update(delta: number) {
        if (this.hp <= 0) return;

        const direction = new Phaser.Math.Vector2(0, 0);

        if (this.keys.W.isDown) direction.y = -1;
        if (this.keys.S.isDown) direction.y = 1;
        if (this.keys.A.isDown) direction.x = -1;
        if (this.keys.D.isDown) direction.x = 1;

        direction.normalize();
        this.setVelocity(direction.x * this.speed, direction.y * this.speed);

        if (this.anims && this.anims.currentAnim) {
            if (direction.x > 0) {
                this.setFlipX(false);
                this.anims.play("walk-right", true);
            } else if (direction.x < 0) {
                this.setFlipX(true);
                this.anims.play("walk-right", true);
            } else if (direction.y < 0) {
                this.anims.play("walk-up", true);
            } else if (direction.y > 0) {
                this.anims.play("walk-down", true);
            } else {
                this.anims.play("idle-down", true);
            }
        }
    }
}