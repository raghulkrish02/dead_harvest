import Phaser from "phaser";
import MainScene from "./scenes/MainScene";

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 1200,
    height: 675,
    pixelArt: false,
    roundPixels: false,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    render: {
        antialias: true,
        antialiasGL: true,
        // 👈 Enables high-DPI retina sharpness:
        resolution: window.devicePixelRatio || 1,
        mipmapFilter: 'LINEAR_MIPMAP_LINEAR'
    },
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