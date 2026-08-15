import Phaser from "phaser";

export default class Backpack {
    public biomassCount: number = 1;
    public pepperAmmo: number = 0;
    public pepperSeeds: number = 2;
    public healHerbs: number = 1;
    public fences: number = 0; // Crafted fences in inventory

    private isOpen: boolean = false;
    
    // --- 1. EXTERNAL PERMANENT TOP-LEFT HP BAR ---
    private hpBg!: Phaser.GameObjects.Rectangle;
    private hpFill!: Phaser.GameObjects.Rectangle;
    private hpText!: Phaser.GameObjects.Text;

    // --- 2. BOTTOM-CENTER BAG BUTTON ---
    private bagButton!: Phaser.GameObjects.Rectangle;
    private bagButtonText!: Phaser.GameObjects.Text;

    // --- 3. POPUP INVENTORY WINDOW ---
    private windowBg!: Phaser.GameObjects.Rectangle;
    private windowTitle!: Phaser.GameObjects.Text;
    private windowContent!: Phaser.GameObjects.Text;
    private closeButton!: Phaser.GameObjects.Text;

    constructor(scene: Phaser.Scene) {
        // ==========================================
        // --- PERMANENT TOP-LEFT HUD (HP BAR) ---
        // ==========================================
        this.hpBg = scene.add.rectangle(220, 130, 164, 20, 0x000000, 0.8);
        this.hpBg.setStrokeStyle(2, 0xff3333);
        this.hpBg.setScrollFactor(0).setDepth(29999);

        this.hpFill = scene.add.rectangle(140, 130, 160, 16, 0x00cc44);
        this.hpFill.setOrigin(0, 0.5);
        this.hpFill.setScrollFactor(0).setDepth(30000);

        this.hpText = scene.add.text(220, 130, "HP: 100 / 100", {
            fontFamily: "Arial",
            fontSize: "11px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30001);

        // ==========================================
        // --- BOTTOM-CENTER BAG BUTTON ---
        // ==========================================
        const buttonX = 630;
        const buttonY = 600;

        this.bagButton = scene.add.rectangle(buttonX, buttonY, 130, 36, 0x1a331a, 0.95);
        this.bagButton.setStrokeStyle(2, 0x55ff55);
        this.bagButton.setScrollFactor(0).setDepth(29999);
        this.bagButton.setInteractive({ useHandCursor: true });

        this.bagButtonText = scene.add.text(buttonX, buttonY, "🎒 Backpack", {
            fontFamily: "Arial",
            fontSize: "14px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30000);

        this.bagButton.on("pointerdown", () => this.toggleInventory(scene));

        if (scene.input.keyboard) {
            const bKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
            const iKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
            bKey.on("down", () => this.toggleInventory(scene));
            iKey.on("down", () => this.toggleInventory(scene));
        }

        // ==========================================
        // --- POPUP INVENTORY WINDOW (CENTER) ---
        // ==========================================
        const windowX = 1000;
        const windowY = 500;

        this.windowBg = scene.add.rectangle(windowX, windowY, 270, 210, 0x111111, 0.95);
        this.windowBg.setStrokeStyle(3, 0x55ff55);
        this.windowBg.setScrollFactor(0).setDepth(30001).setVisible(false);

        this.windowTitle = scene.add.text(windowX, windowY - 80, "🎒 FARMER BACKPACK", {
            fontFamily: "Arial",
            fontSize: "15px",
            color: "#55ff55",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30002).setVisible(false);

        this.closeButton = scene.add.text(windowX + 110, windowY - 85, "[X]", {
            fontFamily: "Arial",
            fontSize: "13px",
            color: "#ff5555",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30002).setVisible(false);
        
        this.closeButton.setInteractive({ useHandCursor: true });
        this.closeButton.on("pointerdown", () => this.toggleInventory(scene));

        this.windowContent = scene.add.text(windowX - 105, windowY - 45, "", {
            fontFamily: "Arial",
            fontSize: "13px",
            color: "#ffffff",
            lineSpacing: 8,
            stroke: "#000000",
            strokeThickness: 2
        }).setScrollFactor(0).setDepth(30002).setVisible(false);

        this.updateHUD(scene);
    }

    public getUIElements(): Phaser.GameObjects.GameObject[] {
        return [
            this.hpBg,
            this.hpFill,
            this.hpText,
            this.bagButton,
            this.bagButtonText,
            this.windowBg,
            this.windowTitle,
            this.windowContent,
            this.closeButton
        ];
    }

    public updateHP(currentHp: number, maxHp: number) {
        const percent = Phaser.Math.Clamp(currentHp / maxHp, 0, 1);
        this.hpFill.displayWidth = 160 * percent;
        this.hpText.setText(`HP: ${currentHp} / ${maxHp}`);

        if (percent > 0.5) {
            this.hpFill.setFillStyle(0x00cc44); // Green
        } else if (percent > 0.25) {
            this.hpFill.setFillStyle(0xffaa00); // Orange
        } else {
            this.hpFill.setFillStyle(0xff2222); // Red
        }
    }

    public toggleInventory(scene?: Phaser.Scene) {
        this.isOpen = !this.isOpen;
        this.windowBg.setVisible(this.isOpen);
        this.windowTitle.setVisible(this.isOpen);
        this.windowContent.setVisible(this.isOpen);
        this.closeButton.setVisible(this.isOpen);
        if (this.isOpen && scene) this.updateHUD(scene);
    }

    public addBiomass(amount: number) {
        this.biomassCount += amount;
    }

    public addPepperAmmo(amount: number) {
        this.pepperAmmo += amount;
    }

    public addPepperSeeds(amount: number) {
        this.pepperSeeds += amount;
    }

    public addHealHerbs(amount: number) {
        this.healHerbs += amount;
    }

    public addFences(amount: number) {
        this.fences += amount;
    }

    public updateHUD(scene?: Phaser.Scene) {
        if (this.windowContent) {
            this.windowContent.setText(
                `🟢 Biomass: ${this.biomassCount}\n` +
                `🌶️ Pepper Ammo: ${this.pepperAmmo}\n` +
                `🌱 Pepper Seeds: ${this.pepperSeeds}\n` +
                `🌿 Heal Herbs: ${this.healHerbs} [Press H]\n` +
                `🪵 Fences: ${this.fences} [Press F to Place]`
            );
        }
    }
}