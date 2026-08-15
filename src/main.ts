import Phaser from "phaser";
import MainScene from "./scenes/MainScene";

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 1280,
    height: 720,
    // Enable Arcade Physics here
    physics: {
        default: "arcade",
        arcade: {
            gravity: { x: 0, y: 0 },
            debug: true // Set to true if you want to see collision hitboxes
        }
    },
    scene: [MainScene]
};

new Phaser.Game(config);