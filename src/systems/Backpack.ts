import Phaser from "phaser";

export default class Backpack {
    public biomassCount: number = 1;
    public pepperAmmo: number = 0;
    public pepperSeeds: number = 2;
    public healHerbs: number = 1;
    // 🔨 3-Slot Trap Build System
    public activeTrapSlot: 1 | 2 | 3 = 1; // 1: Spikes, 2: Sentry, 3: Barrel
    public isSpikeUnlocked: boolean = true;
    public isBarrelUnlocked: boolean = false;
    public isSentryUnlocked: boolean = false;



     // Root-Burst Ultimate Properties
    public rootCharges: number = 1;     // Starts with 1 ready charge
    public maxRootCharges: number = 1;  // MAX capacity starts at 1! (Upgrades to 2 at Lvl 2 Totem)
    public harvestProgress: number = 0; // 0 to 4

    private isOpen: boolean = false;
    
    // --- 1. EXTERNAL PERMANENT TOP-LEFT HP BAR ---
    private hpBg!: Phaser.GameObjects.Rectangle;
    private hpFill!: Phaser.GameObjects.Rectangle;
    private hpText!: Phaser.GameObjects.Text;

    // Root-Burst HUD Elements
    private rootBurstBg!: Phaser.GameObjects.Rectangle;
    private rootBurstText!: Phaser.GameObjects.Text;

    // --- 2. BOTTOM-CENTER BAG BUTTON ---
    private bagButton!: Phaser.GameObjects.Rectangle;
    private bagButtonText!: Phaser.GameObjects.Text;

    // --- 3. POPUP INVENTORY WINDOW ---
    private windowBg!: Phaser.GameObjects.Rectangle;
    private windowTitle!: Phaser.GameObjects.Text;
    private windowContent!: Phaser.GameObjects.Text;
    private closeButton!: Phaser.GameObjects.Text;

    public isDodgeUnlocked: boolean = true; // Set to true to test right away! nw its from wave 1
    public stamina: number = 100;
    public maxStamina: number = 100;
    private staminaRegenDelayTimer: number = 0; // 0.8s Delay Tracker

    // Stamina HUD
    private staminaBg!: Phaser.GameObjects.Rectangle;
    private staminaFill!: Phaser.GameObjects.Rectangle;
    private staminaText!: Phaser.GameObjects.Text;

    // 🎃 3-Crop Agricultural Arsenal
    public pumpkinSeeds: number = 0;
    public ironPumpkins: number = 0;
    public activeSeedType: "pepper" | "pumpkin" = "pepper";

    // HUD Seed Pouch Widget
    private seedPouchBg!: Phaser.GameObjects.Rectangle;
    private seedPouchText!: Phaser.GameObjects.Text;

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

         // 🌿 Root-Burst HUD (Docked directly below HP Bar)
        this.rootBurstBg = scene.add.rectangle(220, 155, 164, 18, 0x0a1a0a, 0.85);
        this.rootBurstBg.setStrokeStyle(1.5, 0x33aa33);
        this.rootBurstBg.setScrollFactor(0).setDepth(29999);

        this.rootBurstText = scene.add.text(220, 155, "🌿 ROOT [Q]: 🟢 🟢 (2/2)", {
            fontFamily: "Arial",
            fontSize: "10px",
            color: "#55ff55",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30001);

        // ⚡ Stamina HUD Bar (Docked below Root Burst at y = 175)
        // ⚡ Stamina HUD (Visible from Wave 1)
        this.staminaBg = scene.add.rectangle(220, 175, 164, 14, 0x000000, 0.8);
        this.staminaBg.setStrokeStyle(1.5, 0x00aaff).setScrollFactor(0).setDepth(29999).setVisible(true);

        this.staminaFill = scene.add.rectangle(140, 175, 160, 10, 0x00aaff);
        this.staminaFill.setOrigin(0, 0.5).setScrollFactor(0).setDepth(30000).setVisible(true);

        this.staminaText = scene.add.text(220, 175, "⚡ STAMINA [SHIFT]: 100%", {
            fontFamily: "Arial",
            fontSize: "9px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 2
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30001).setVisible(true);


        // ==========================================
        // --- BOTTOM-CENTER BAG BUTTON ---
        // ==========================================
        const buttonX = 630;
        const buttonY = 580;

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
        const windowX = 280;
        const windowY = 450;

        this.windowBg = scene.add.rectangle(windowX, windowY, 270, 280, 0x111111, 0.95);
        this.windowBg.setStrokeStyle(3, 0x55ff55);
        this.windowBg.setScrollFactor(0).setDepth(30001).setVisible(false);

        this.windowTitle = scene.add.text(windowX, windowY - 100, "🎒 FARMER BACKPACK", {
            fontFamily: "Arial",
            fontSize: "15px",
            color: "#55ff55",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30002).setVisible(false);

        this.closeButton = scene.add.text(windowX + 110, windowY - 100, "[X]", {
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

            // 🎒 On-Screen Seed Pouch Widget (Bottom-Right next to Backpack)
        const pouchX = 800;
        const pouchY = 580;

        this.seedPouchBg = scene.add.rectangle(pouchX, pouchY, 170, 36, 0x142814, 0.95);
        this.seedPouchBg.setStrokeStyle(2, 0xffaa00).setScrollFactor(0).setDepth(29999).setInteractive({ useHandCursor: true });

        this.seedPouchText = scene.add.text(pouchX, pouchY, "🌱 [TAB] 🌶️ Pepper (2)", {
            fontFamily: "Arial",
            fontSize: "12px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(30000);

        // Click on widget to toggle active seed!
        this.seedPouchBg.on("pointerdown", () => this.toggleActiveSeed());

            this.updateHUD(scene);
            this.updateRootBurstHUD();
        } // <-- Fixed: Properly closes the constructor!


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
        if (this.isOpen) this.updateHUD(); // 🎒 Live update on pickup/spending!
    }

    public addPepperAmmo(amount: number) {
        this.pepperAmmo += amount;
        if (this.isOpen) this.updateHUD(); // 🎒 Live update on harvest/shooting!
    }

    public addPepperSeeds(amount: number) {
        this.pepperSeeds += amount;
        this.updateSeedPouchUI();
        if (this.isOpen) this.updateHUD();
    }

    public addHealHerbs(amount: number) {
        this.healHerbs += amount;
        if (this.isOpen) this.updateHUD(); // 🎒 Live update on herb harvest!
    }

    public addFences(amount: number) {
        this.fences += amount;
        if (this.isOpen) this.updateHUD(); // 🎒 Live update on crafting!
    }

    public updateHUD(scene?: Phaser.Scene) {
        if (this.windowContent) {
            this.windowContent.setText(
                `🟢 Biomass: ${this.biomassCount}\n` +
                `🌶️ Pepper Ammo: ${this.pepperAmmo}\n` +
                `🌱 Pepper Seeds: ${this.pepperSeeds}\n` +
                `🎃 Pumpkin Seeds: ${this.pumpkinSeeds}\n` +
                `🎃 Iron Pumpkins: ${this.ironPumpkins}\n` +
                `🌿 Heal Herbs: ${this.healHerbs} [Press H]\n` +
                `🌵 Bramble Spikes (1 Biomass) [Build Bar: F]\n` +
                `🧨 Pepper Barrel (1 Bio + 1 Ammo)\n` +
                `🎃 Pumpkin Sentry (2 Bio + 1 Pumpkin)`
            );
        }
    }
    public updateRootBurstHUD() {
        let chargeIcons = "";
        for (let i = 0; i < this.maxRootCharges; i++) {
            chargeIcons += i < this.rootCharges ? "🟢 " : "⚪ ";
        }
        
        // Only show [X/4] progress when you actually have missing charges to fill!
        const progressIndicator = this.rootCharges < this.maxRootCharges ? ` [${this.harvestProgress}/4]` : "";
        this.rootBurstText.setText(`🌿 ROOT [Q]: ${chargeIcons.trim()} (${this.rootCharges}/${this.maxRootCharges})${progressIndicator}`);
    }

    public recordHarvest(): boolean {
        // 🔒 ANTI-EXPLOIT LOCK: If already at max capacity, do NOT bank any partial progress!
        if (this.rootCharges >= this.maxRootCharges) {
            this.harvestProgress = 0;
            this.updateRootBurstHUD();
            return false;
        }

        this.harvestProgress++;
        
        if (this.harvestProgress >= 4) {
            this.harvestProgress = 0;
            this.rootCharges = Math.min(this.maxRootCharges, this.rootCharges + 1);
            this.updateRootBurstHUD();
            return true; // Gained full charge!
        }

        this.updateRootBurstHUD();
        return false;
    }

    public consumeRootCharge(): boolean {
        if (this.rootCharges > 0) {
            this.rootCharges--;
            this.updateRootBurstHUD();
            return true;
        }
        return false;
    }

    public addRootCharge(amount: number = 1): boolean {
        if (this.rootCharges < this.maxRootCharges) {
            this.rootCharges = Math.min(this.maxRootCharges, this.rootCharges + amount);
            this.updateRootBurstHUD();
            return true;
        }
        return false;
    }

    public setMaxRootCharges(max: number) {
        this.maxRootCharges = max;
        this.rootCharges = Math.min(this.rootCharges, max);
        this.updateRootBurstHUD();
    }

    public updateStamina(delta: number, isMoving: boolean) {
        // 1. Check if the 0.8s delay is active
        if (this.staminaBg.scene.time.now < this.staminaRegenDelayTimer) {
            const pct = Phaser.Math.Clamp(this.stamina / this.maxStamina, 0, 1);
            this.staminaFill.displayWidth = 160 * pct;
            this.staminaText.setText(`⚡ STAMINA [SHIFT]: ${Math.round(this.stamina)}%`);
            this.staminaFill.setFillStyle(0xff3300); // Red alert while frozen!
            return;
        }

        // 2. Recharge: 6.0s while moving (16.67/s) | 3.0s standing still (33.33/s)
        const regenRate = isMoving ? (100 / 6000) * delta : (100 / 3000) * delta;
        this.stamina = Math.min(this.maxStamina, this.stamina + regenRate);

        const pct = Phaser.Math.Clamp(this.stamina / this.maxStamina, 0, 1);
        this.staminaFill.displayWidth = 160 * pct;
        this.staminaText.setText(`⚡ STAMINA [SHIFT]: ${Math.round(this.stamina)}%`);

        if (this.stamina < 33) this.staminaFill.setFillStyle(0xffaa00);
        else this.staminaFill.setFillStyle(0x00aaff);
    }

    // ⚡ Fair Dodge: Cost reduced for fluid combat mobility
    public consumeStamina(amount: number = 33): boolean {
        if (this.stamina >= amount) {
            this.stamina -= amount;
            this.staminaRegenDelayTimer = (this.staminaBg.scene.time.now) + 600;
            return true;
        }
        return false;
    }

    public unlockDodgeUI() {
        this.isDodgeUnlocked = true;
        this.staminaBg?.setVisible(true);
        this.staminaFill?.setVisible(true);
        this.staminaText?.setVisible(true);
    }

    // 🗡️ Rhythmic Combo Stamina: 4 -> 5 -> 8 (Fast 180ms regen delay)
    public consumeMeleeStamina(hitStep: number = 1): boolean {
        const cost = hitStep === 3 ? 8 : (hitStep === 2 ? 5 : 4);
        if (this.stamina >= cost) {
            this.stamina -= cost;
            this.staminaRegenDelayTimer = (this.staminaBg.scene.time.now) + 180;
            return true;
        }
        return false;
    }

    public toggleActiveSeed() {
        if (this.activeSeedType === "pepper") {
            this.activeSeedType = "pumpkin";
        } else {
            this.activeSeedType = "pepper";
        }
        this.updateSeedPouchUI();
    }

    public updateSeedPouchUI() {
        if (!this.seedPouchText) return;
        if (this.activeSeedType === "pepper") {
            this.seedPouchText.setText(`🌱 [TAB] 🌶️ Pepper (${this.pepperSeeds})`);
            this.seedPouchBg.setStrokeStyle(2, 0xffaa00);
        } else {
            this.seedPouchText.setText(`🌱 [TAB] 🎃 Pumpkin (${this.pumpkinSeeds})`);
            this.seedPouchBg.setStrokeStyle(2, 0xff7700);
        }
    }

    public addPumpkinSeeds(amount: number) {
        this.pumpkinSeeds += amount;
        this.updateSeedPouchUI();
        if (this.isOpen) this.updateHUD();
    }

    public addIronPumpkins(amount: number) {
        this.ironPumpkins += amount;
        if (this.isOpen) this.updateHUD();
    }


}