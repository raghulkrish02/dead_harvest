import Phaser from "phaser";
import Zombie from "../enemies/Zombie";

export default class MeleeWeapon {
    private scene: Phaser.Scene;
    private attackCooldown: number = 300;
    private lastAttackTime: number = 0;

    // 🗡️ 3-Hit Combo State Tracking
    private comboStep: 1 | 2 | 3 = 1;
    private lastComboTime: number = 0;

    public damage: number = 10;
    public knockbackForce: number = 250;

    // Reusable math & visual structures (Zero-GC)
    private attackLine: Phaser.Geom.Line;
    private slashFxGraphics: Phaser.GameObjects.Graphics;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.attackLine = new Phaser.Geom.Line();
        
        // Pre-allocate slash graphic layer
        this.slashFxGraphics = this.scene.add.graphics();
        this.slashFxGraphics.setDepth(20000); // Renders above terrain/blood
    }

    public attack(
        playerX: number, 
        chestY: number, 
        pointer: Phaser.Input.Pointer, 
        backpack?: any, 
        isHolding: boolean = false
    ): boolean {
        const currentTime = this.scene.time.now;
        if (currentTime - this.lastAttackTime < this.attackCooldown) return false;

        // Reset combo to Hit 1 if idle for more than 750ms
        if (currentTime - this.lastComboTime > 750) {
            this.comboStep = 1;
        }

        // Stamina cost scales fairly with the combo step (4 -> 5 -> 8)
        if (backpack && !backpack.consumeMeleeStamina(this.comboStep)) {
            return false;
        }

        this.lastAttackTime = currentTime;
        this.lastComboTime = currentTime;

        const mainScene = this.scene as any;
        const player = mainScene.player;
        const isLeft = player && player.isFacingLeft;

        // 🎯 1. Pure Forward Aim Angle (100% Symmetrical: NEVER winds up behind spine!)
        const rawAngle = Phaser.Math.Angle.Between(playerX, chestY, pointer.worldX, pointer.worldY);
        const isAimingDown = pointer.worldY > chestY;
        let baseArmAngle = 0;

        if (isLeft) {
            // Facing Left: Forward is Math.PI. Down-left is Math.PI - 0.25, Up-left is Math.PI + 0.25
            baseArmAngle = Math.PI + (isAimingDown ? -0.22 : 0.22);
        } else {
            // Facing Right: Forward is 0. Down-right is +0.22, Up-right is -0.22
            baseArmAngle = isAimingDown ? 0.22 : -0.22;
        }

        const currentHit = this.comboStep;
        this.comboStep = this.comboStep === 3 ? 1 : ((this.comboStep + 1) as any);

        const thrustDirX = Math.cos(rawAngle);
        const thrustDirY = Math.sin(rawAngle);

        // =========================================================================
        // ⚔️ 2. ATHLETIC COMBAT LUNGES (Pure Forward Swings on Both Sides)
        // =========================================================================
        if (player && player.pitchforkSprite) {
            player.isMeleeSwinging = true;
            this.scene.tweens.killTweensOf(player.pitchforkSprite);

            // --- HIT 1: Top-to-Bottom Snap Slash (Starts Up-Forward, Swings Down-Forward) ---
            if (currentHit === 1) {
                const startAngle = isLeft ? (baseArmAngle + 0.20) : (baseArmAngle - 0.20);
                const endAngle = isLeft ? (baseArmAngle - 0.20) : (baseArmAngle + 0.20);
                player.pitchforkSprite.setRotation(startAngle);

                this.scene.tweens.add({
                    targets: player.pitchforkSprite,
                    rotation: endAngle,
                    x: player.pitchforkSprite.x + thrustDirX * 8,
                    y: player.pitchforkSprite.y + thrustDirY * 8,
                    duration: 95,
                    yoyo: true,
                    ease: "Quad.easeOut",
                    onComplete: () => { player.isMeleeSwinging = false; }
                });
            }
            // --- HIT 2: Bottom-to-Top Reverse Snap Slash ---
            else if (currentHit === 2) {
                const startAngle = isLeft ? (baseArmAngle - 0.20) : (baseArmAngle + 0.20);
                const endAngle = isLeft ? (baseArmAngle + 0.20) : (baseArmAngle - 0.20);
                player.pitchforkSprite.setRotation(startAngle);

                this.scene.tweens.add({
                    targets: player.pitchforkSprite,
                    rotation: endAngle,
                    x: player.pitchforkSprite.x + thrustDirX * 10,
                    y: player.pitchforkSprite.y + thrustDirY * 10,
                    duration: 90,
                    yoyo: true,
                    ease: "Quad.easeOut",
                    onComplete: () => { player.isMeleeSwinging = false; }
                });
            }
            // --- HIT 3: Heavy Piercing Javelin Lunge (18px Explosive Thrust) ---
            else {
                player.pitchforkSprite.setRotation(baseArmAngle);

                this.scene.tweens.add({
                    targets: player.pitchforkSprite,
                    x: player.pitchforkSprite.x + thrustDirX * 18,
                    y: player.pitchforkSprite.y + thrustDirY * 18,
                    duration: 75,
                    yoyo: true,
                    ease: "Expo.easeOut",
                    onComplete: () => { player.isMeleeSwinging = false; }
                });
            }
        }

        // =========================================================================
        // 💥 3. COMBO DAMAGE & HITBOX
        // =========================================================================
        // 💥 Fair Rewarding Combo Damage (Walkers die in 1+2 combo, Lance chunks Brutes)
        const damage = currentHit === 3 ? 18 : (currentHit === 2 ? 10 : 8);
        const reachDistance = currentHit === 3 ? 68 : 48;
        const knockback = currentHit === 3 ? 400 : 240;

        // Render Phoenix-grade additive VFX
        this.renderComboSlashArc(playerX, chestY, rawAngle, reachDistance, currentHit);

        const endX = playerX + Math.cos(rawAngle) * reachDistance;
        const endY = chestY + Math.sin(rawAngle) * reachDistance;
        this.attackLine.setTo(playerX, chestY, endX, endY);

        if (mainScene.waveManager) {
            const activeZombies = mainScene.waveManager.getActiveZombies();
            activeZombies.forEach((zombie: any) => {
                if (zombie.active && Phaser.Geom.Intersects.LineToRectangle(this.attackLine, zombie.getBounds())) {
                    const knockbackDir = new Phaser.Math.Vector2(zombie.x - playerX, zombie.y - chestY).normalize();

                    zombie.setTint(0xffffff);
                    this.scene.time.delayedCall(60, () => { if (zombie.active) zombie.clearTint(); });

                    if (mainScene.triggerHitStop) mainScene.triggerHitStop(currentHit === 3 ? 40 : 0);
                    if (mainScene.triggerSmartShake) {
                        mainScene.triggerSmartShake(currentHit === 3 ? "MEDIUM" : "LIGHT");
                    } else {
                        this.scene.cameras.main.shake(currentHit === 3 ? 80 : 35, currentHit === 3 ? 0.004 : 0.0015);
                    }

                    zombie.takeDamage(damage, knockbackDir, knockback, "MELEE");
                }
            });
        }

        return true;
    }

    private renderComboSlashArc(x: number, y: number, angle: number, radius: number, hitStep: number): void {
        const mainScene = this.scene as any;
        // 🌳 Y-Sorted: Renders in front of player, but BEHIND trees when standing behind them!
        const slashDepth = (mainScene.player ? mainScene.player.depth : y) + 2;

        this.slashFxGraphics.clear();
        this.slashFxGraphics.setAlpha(1);
        this.slashFxGraphics.setBlendMode(Phaser.BlendModes.ADD).setDepth(slashDepth);

        const tipX = x + Math.cos(angle) * radius;
        const tipY = y + Math.sin(angle) * radius;

        // =========================================================================
        // ⚡ HIT 3: PHOENIX-CLASS SONIC PIERCING LANCE (Cyan/White Kinetic Burst)
        // =========================================================================
        if (hitStep === 3) {
            // A. High-Velocity Piercing Energy Core
            this.slashFxGraphics.lineStyle(6, 0x00ffff, 0.75);
            this.slashFxGraphics.beginPath();
            this.slashFxGraphics.moveTo(x + Math.cos(angle) * 14, y + Math.sin(angle) * 14);
            this.slashFxGraphics.lineTo(tipX + Math.cos(angle) * 8, tipY + Math.sin(angle) * 8);
            this.slashFxGraphics.strokePath();

            // B. Razor White Kinetic Spike
            this.slashFxGraphics.lineStyle(2.5, 0xffffff, 1.0);
            this.slashFxGraphics.beginPath();
            this.slashFxGraphics.moveTo(x + Math.cos(angle) * 16, y + Math.sin(angle) * 16);
            this.slashFxGraphics.lineTo(tipX + Math.cos(angle) * 10, tipY + Math.sin(angle) * 10);
            this.slashFxGraphics.strokePath();

            // C. Expanding Sonic Shockwave Ring at Tines
            const shockRing = this.scene.add.circle(tipX, tipY, 6, 0x00ffff, 0.85);
            shockRing.setStrokeStyle(3, 0xffffff).setBlendMode(Phaser.BlendModes.ADD).setDepth(slashDepth + 1);
            this.scene.tweens.add({
                targets: shockRing,
                radius: 26,
                alpha: 0,
                duration: 180,
                ease: "Expo.easeOut",
                onComplete: () => shockRing.destroy()
            });

            // D. 4 Sonic Wind Streaks
            for (let w = 0; w < 4; w++) {
                const wOff = (w - 1.5) * 8;
                const perpX = -Math.sin(angle) * wOff;
                const perpY = Math.cos(angle) * wOff;
                const streak = this.scene.add.ellipse(x + perpX, y + perpY, 14, 2.5, 0x99ffff, 0.9);
                streak.setRotation(angle).setBlendMode(Phaser.BlendModes.ADD).setDepth(slashDepth + 1);
                this.scene.tweens.add({
                    targets: streak,
                    x: streak.x + Math.cos(angle) * (radius * 0.8),
                    y: streak.y + Math.sin(angle) * (radius * 0.8),
                    scaleX: 0.2,
                    alpha: 0,
                    duration: 150,
                    ease: "Quad.easeOut",
                    onComplete: () => streak.destroy()
                });
            }
        } 
        // =========================================================================
        // 🗡️ HITS 1 & 2: RAZOR-SHARP CRESCENT MOON (Zero 360° Circle Bugs!)
        // =========================================================================
        else {
            const isHit2 = hitStep === 2;
            const primaryColor = isHit2 ? 0xff3311 : 0xffaa00;
            const arcSpan = 0.65;
            const numSteps = 16;

            const outerPts: { x: number; y: number }[] = [];
            const innerPts: { x: number; y: number }[] = [];
            const coreOuterPts: { x: number; y: number }[] = [];
            const coreInnerPts: { x: number; y: number }[] = [];

            // 🌙 Mathematical Tapered Crescent: Ends taper to 0px, middle swells to 13px
            for (let i = 0; i <= numSteps; i++) {
                const t = i / numSteps;
                const curAngle = (angle - arcSpan) + t * (arcSpan * 2);
                const taper = Math.sin(t * Math.PI); // 0 at ends, 1.0 in center

                // Outer Glowing Blade
                const auraW = 6.5 * taper;
                outerPts.push({ x: x + Math.cos(curAngle) * (radius + auraW), y: y + Math.sin(curAngle) * (radius + auraW) });
                innerPts.unshift({ x: x + Math.cos(curAngle) * (radius - auraW), y: y + Math.sin(curAngle) * (radius - auraW) });

                // Inner White-Hot Razor Cutting Edge
                const coreW = 2.2 * taper;
                coreOuterPts.push({ x: x + Math.cos(curAngle) * (radius + coreW), y: y + Math.sin(curAngle) * (radius + coreW) });
                coreInnerPts.unshift({ x: x + Math.cos(curAngle) * (radius - coreW), y: y + Math.sin(curAngle) * (radius - coreW) });
            }

            // Layer 1: Colored Energy Crescent
            this.slashFxGraphics.fillStyle(primaryColor, 0.75);
            this.slashFxGraphics.fillPoints(outerPts.concat(innerPts), true);

            // Layer 2: White Razor Core
            this.slashFxGraphics.fillStyle(0xffffff, 0.95);
            this.slashFxGraphics.fillPoints(coreOuterPts.concat(coreInnerPts), true);

            // ⚡ Layer 3: High-Velocity Friction Sparks
            for (let s = 0; s < 4; s++) {
                const sAngle = angle + Phaser.Math.FloatBetween(-0.4, 0.4);
                const sDist = radius + Phaser.Math.Between(1, 8);
                const spark = this.scene.add.circle(x + Math.cos(sAngle) * sDist, y + Math.sin(sAngle) * sDist, 2.5, 0xffffff);
                spark.setBlendMode(Phaser.BlendModes.ADD).setDepth(slashDepth + 1);

                this.scene.tweens.add({
                    targets: spark,
                    x: spark.x + Math.cos(sAngle) * 16,
                    y: spark.y + Math.sin(sAngle) * 16,
                    scale: 0.1,
                    alpha: 0,
                    duration: 110,
                    ease: "Quad.easeOut",
                    onComplete: () => spark.destroy()
                });
            }
        }

        // Clean quick fade
        this.scene.tweens.add({
            targets: this.slashFxGraphics,
            alpha: 0,
            duration: hitStep === 3 ? 120 : 90,
            ease: "Cubic.easeOut"
        });
    }
}