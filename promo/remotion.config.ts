import { Config } from "@remotion/cli/config";

// Applies to the CLI commands (studio, render, still). See README.md.

// three.js needs a real GL backend in headless Chromium: ANGLE uses the machine's GPU and falls back to software.
Config.setChromiumOpenGlRenderer("angle");

// Frames are captured as high-quality JPEGs, then encoded to H.264 at a low CRF.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(96);
Config.setCodec("h264");
Config.setCrf(18);
Config.setX264Preset("slow");
Config.setPixelFormat("yuv420p");
Config.setColorSpace("bt709");
Config.setStillImageFormat("png");
Config.setOverwriteOutput(true);
