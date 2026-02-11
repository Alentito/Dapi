import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as PIXI from "pixi.js";
import Matter from "matter-js";
import logo from "./assets/Logo.svg";
import dapi from "./assets/Dapi6.svg";

const blocks = [
  { label: "FLY FORWARD", color: "#00C37A", type: "start" },
  { label: "FLY", color: "#FFD753", type: "action", param: "5s" },
  { label: "TAKEOFF", color: "#3B82F6", type: "action", param: "3m" },
  { label: "ROTATE", color: "#7C3AED", type: "action", param: "90°" },
  { label: "LAND", color: "#FF5A5F", type: "end" },
];

const physicsTweaks = {
  fallTiltRange: { min: -0.35, max: 0.35 },
  initialSpinRange: { min: -0.03, max: 0.03 },
  horizontalDriftRange: { min: -2.2, max: 2.2 },
  spawnYOffset: 90,
};

const randomInRange = (min, max) => Math.random() * (max - min) + min;

export default function PhysicsBlocksSection() {
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let app;
  let engine;
  let handleResize;
  let update;
  let mouseConstraint;
  const eventHandlers = {};
  let isMounted = true;
  let didInit = false;

    const initApp = async () => {
      try {
        const width = window.innerWidth;
        const height = window.innerHeight;

        app = new PIXI.Application();
        await app.init({
          width,
          height,
          backgroundAlpha: 0,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        didInit = true;

        if (!isMounted || !containerRef.current) {
          app.destroy(true);
          return;
        }

        containerRef.current.appendChild(app.canvas);

        engine = Matter.Engine.create();
        const { world } = engine;
        engine.gravity.y = 1;

        const ground = Matter.Bodies.rectangle(width / 2, height + 40, width * 1.2, 80, {
          isStatic: true,
        });
        const leftWall = Matter.Bodies.rectangle(-60, height / 2, 20, height * 2, {
          isStatic: true,
        });
        const rightWall = Matter.Bodies.rectangle(width + 60, height / 2, 120, height * 2, {
          isStatic: true,
        });
        Matter.World.add(world, [ground, leftWall, rightWall]);

        const blockBodies = [];
        const blockGraphics = [];

        const drawBlocklyBlock = (
          graphics,
          block,
          blockWidth,
          blockHeight,
          { fillColor, fillAlpha = 1, skipHighlights = false } = {}
        ) => {
          const notchWidth = 26;
          const notchDepth = 5;
          const cornerRadius = 4;

          graphics.beginFill(fillColor ?? block.color, fillAlpha);
          graphics.moveTo(cornerRadius, 0);

          if (block.type !== "start") {
            graphics.lineTo(blockWidth / 2 - notchWidth / 2, 0);
            graphics.lineTo(blockWidth / 2 - notchWidth / 2 + 3, -notchDepth);
            graphics.bezierCurveTo(
              blockWidth / 2 - 6,
              -notchDepth - 2,
              blockWidth / 2 + 6,
              -notchDepth - 2,
              blockWidth / 2 + notchWidth / 2 - 3,
              -notchDepth
            );
            graphics.lineTo(blockWidth / 2 + notchWidth / 2, 0);
          }
          graphics.lineTo(blockWidth - cornerRadius, 0);
          graphics.quadraticCurveTo(blockWidth, 0, blockWidth, cornerRadius);
          graphics.lineTo(blockWidth, blockHeight - cornerRadius);
          graphics.quadraticCurveTo(blockWidth, blockHeight, blockWidth - cornerRadius, blockHeight);

          if (block.type !== "end") {
            graphics.lineTo(blockWidth / 2 + notchWidth / 2, blockHeight);
            graphics.lineTo(blockWidth / 2 + notchWidth / 2 - 3, blockHeight + notchDepth);
            graphics.bezierCurveTo(
              blockWidth / 2 + 6,
              blockHeight + notchDepth + 2,
              blockWidth / 2 - 6,
              blockHeight + notchDepth + 2,
              blockWidth / 2 - notchWidth / 2 + 3,
              blockHeight + notchDepth
            );
            graphics.lineTo(blockWidth / 2 - notchWidth / 2, blockHeight);
          }

          graphics.lineTo(cornerRadius, blockHeight);
          graphics.quadraticCurveTo(0, blockHeight, 0, blockHeight - cornerRadius);
          graphics.lineTo(0, cornerRadius);
          graphics.quadraticCurveTo(0, 0, cornerRadius, 0);
          graphics.endFill();

          if (!skipHighlights) {
            graphics.beginFill(0x000000, 0.12);
            graphics.drawRoundedRect(3, blockHeight - 5, blockWidth - 6, 4, 2);
            graphics.endFill();

            graphics.beginFill(0xffffff, 0.18);
            graphics.drawRoundedRect(4, 2, blockWidth - 8, 2, 1);
            graphics.endFill();
          }
        };

        blocks.forEach((block, index) => {
          const blockHeight = 50;
          const labelLength = block.label.length;
          const paramLength = block.param ? block.param.length : 0;
          const blockWidth = Math.max(200, 60 + (labelLength + paramLength) * 8);

          const isLeftGroup = index < 3;
          const groupIndex = isLeftGroup ? index : index - 3;
          const xOffset = isLeftGroup
            ? width / 3 - 100 + groupIndex * 60
            : (2 * width) / 3 - 80 + groupIndex * 60;
          const yOffset = -140 - index * physicsTweaks.spawnYOffset;

          const body = Matter.Bodies.rectangle(xOffset, yOffset, blockWidth, blockHeight, {
            restitution: 0.25,
            friction: 0.5,
            density: 0.001,
            frictionAir: 0.02,
            sleepThreshold: Infinity,
          });
          Matter.World.add(world, body);

          const initialAngle = randomInRange(
            physicsTweaks.fallTiltRange.min,
            physicsTweaks.fallTiltRange.max
          );
          const initialSpin = randomInRange(
            physicsTweaks.initialSpinRange.min,
            physicsTweaks.initialSpinRange.max
          );
          const horizontalDrift = randomInRange(
            physicsTweaks.horizontalDriftRange.min,
            physicsTweaks.horizontalDriftRange.max
          );

          Matter.Body.setAngle(body, initialAngle);
          Matter.Body.setAngularVelocity(body, initialSpin);
          Matter.Body.setVelocity(body, { x: horizontalDrift, y: body.velocity.y });

          const shadow = new PIXI.Graphics();
          drawBlocklyBlock(shadow, block, blockWidth, blockHeight, {
            fillColor: 0x000000,
            fillAlpha: 0.25,
            skipHighlights: true,
          });

          const shape = new PIXI.Graphics();
          drawBlocklyBlock(shape, block, blockWidth, blockHeight);

          const label = new PIXI.Text(block.label, {
            fontFamily: "Poppins",
            fontWeight: "600",
            fontSize: 14,
            fill: "#ffffff",
            resolution: 2,
          });
          label.anchor.set(0, 0.5);
          label.x = 16;
          label.y = blockHeight / 2;
          shape.addChild(label);

          if (block.param) {
            const paramText = new PIXI.Text(block.param, {
              fontFamily: "Poppins",
              fontWeight: "400",
              fontSize: 12,
              fill: "#ffffff",
              resolution: 2,
            });
            paramText.anchor.set(1, 0.5);
            paramText.x = blockWidth - 16;
            paramText.y = blockHeight / 2;
            shape.addChild(paramText);
          }

          shadow.x = -blockWidth / 2;
          shadow.y = -blockHeight / 2 + 3;
          shape.x = -blockWidth / 2;
          shape.y = -blockHeight / 2;

          const container = new PIXI.Container();
          container.addChild(shadow);
          container.addChild(shape);
          app.stage.addChild(container);

          blockBodies.push(body);
          blockGraphics.push(container);
        });

        const mouse = Matter.Mouse.create(app.canvas);
        mouseConstraint = Matter.MouseConstraint.create(engine, {
          mouse,
          constraint: {
            stiffness: 0.65,
            damping: 0.18,
            render: { visible: false },
          },
        });
        Matter.World.add(world, mouseConstraint);

        mouse.pixelRatio = window.devicePixelRatio || 1;

        const connectedBlocks = new Map();

        const handleStartDrag = (event) => {
          const body = event.body;
          if (!body) return;
          setIsDragging(true);
          body.frictionAir = 0.2;
          body.friction = 0.3;
          Matter.Body.setAngularVelocity(body, 0);
        };

        const handleEndDrag = (event) => {
          const body = event.body;
          if (!body) return;
          setIsDragging(false);
          body.frictionAir = 0.02;
          body.friction = 0.5;
          Matter.Body.setVelocity(body, { x: 0, y: 0 });
          Matter.Body.setAngularVelocity(body, 0);

          const snapDistance = 70;
          const blockIndex = blockBodies.indexOf(body);
          if (blockIndex === -1) return;

          const currentBlock = blocks[blockIndex];
          blockBodies.forEach((otherBody, otherIndex) => {
            if (otherIndex === blockIndex) return;

            const otherBlock = blocks[otherIndex];
            const dx = otherBody.position.x - body.position.x;
            const dy = otherBody.position.y - body.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < snapDistance && Math.abs(dx) < 40) {
              if (currentBlock.type !== "end" && otherBlock.type !== "start") {
                const verticalGap = dy;
                if (Math.abs(verticalGap - 54) < 25) {
                  Matter.Body.setPosition(body, {
                    x: otherBody.position.x,
                    y: otherBody.position.y - 54,
                  });
                  Matter.Body.setVelocity(body, { x: 0, y: 0 });
                  Matter.Body.setAngularVelocity(body, 0);
                  Matter.Body.setAngle(body, 0);

                  const key = `${blockIndex}-${otherIndex}`;
                  if (!connectedBlocks.has(key)) {
                    const constraint = Matter.Constraint.create({
                      bodyA: body,
                      bodyB: otherBody,
                      pointA: { x: 0, y: 25 },
                      pointB: { x: 0, y: -25 },
                      stiffness: 0.9,
                      length: 0,
                    });
                    Matter.World.add(world, constraint);
                    connectedBlocks.set(key, constraint);
                  }
                }
              }
            }
          });
        };

        eventHandlers.startdrag = handleStartDrag;
        eventHandlers.enddrag = handleEndDrag;

        Matter.Events.on(mouseConstraint, "startdrag", handleStartDrag);
        Matter.Events.on(mouseConstraint, "enddrag", handleEndDrag);

        update = () => {
          Matter.Engine.update(engine);
          blockBodies.forEach((body, index) => {
            const graphic = blockGraphics[index];
            graphic.x = body.position.x;
            graphic.y = body.position.y;
            graphic.rotation = body.angle;
          });
        };
        app.ticker.add(update);

        handleResize = () => {
          const newWidth = window.innerWidth;
          const newHeight = window.innerHeight;
          app.renderer.resize(newWidth, newHeight);
        };
        window.addEventListener("resize", handleResize);
      } catch (error) {
        console.error("Failed to initialize PixiJS:", error);
        if (app && didInit) {
          try {
            app.destroy(true);
          } catch (destroyError) {
            console.warn("Skipping Pixi destroy after failed init:", destroyError);
          }
        }
      }
    };

    initApp();

    return () => {
      isMounted = false;
      if (handleResize) {
        window.removeEventListener("resize", handleResize);
      }
      if (mouseConstraint && eventHandlers.startdrag) {
        Matter.Events.off(mouseConstraint, "startdrag", eventHandlers.startdrag);
      }
      if (mouseConstraint && eventHandlers.enddrag) {
        Matter.Events.off(mouseConstraint, "enddrag", eventHandlers.enddrag);
      }
      if (app && update) {
        app.ticker.remove(update);
      }
      if (app && didInit) {
        try {
          app.destroy(true);
        } catch (error) {
          console.warn("Skipping Pixi destroy during cleanup:", error);
        }
      }
      if (engine) {
        Matter.World.clear(engine.world);
        Matter.Engine.clear(engine);
      }
    };
  }, []);

  return (
    <section
      style={{
        position: "relative",
        background: "#fdfdfb",
        fontFamily: "Poppins, sans-serif",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          pointerEvents: "none",
        }}
      >
        <header
          style={{
            width: "100%",
            padding: "25px 25px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "#1b1b1b",
            pointerEvents: isDragging ? "none" : "auto",
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <img src={dapi} alt="DAPI" style={{  height: "28px", width: "auto" }} />
            
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button
              style={{
                padding: "10px 20px",
                background: "transparent",
                color: "#222",
                border: "1px solid rgba(0,0,0,0.12)",
                borderRadius: "999px",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: 500,
                pointerEvents: isDragging ? "none" : "auto",
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              Log in
            </button>
            <button
              style={{
                padding: "10px 24px",
                borderRadius: "999px",
                background: "#000",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: 600,
                boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                pointerEvents: isDragging ? "none" : "auto",
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              Github
            </button>
          </div>
        </header>

        <main
          style={{
            flex: 1,
            width: "100%",
            maxWidth: "960px",
            margin: "0 auto",
            padding: "0 40px 80px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            color: "#222",
            pointerEvents: "none",
          }}
        >
          <img
            src={logo}
            alt="DAPI Logo"
            style={{
              width: "760px",
              height: "auto",
              marginBottom: "24px",
              pointerEvents: "none",
            }}
          />
          <p
            style={{
              margin: "0 auto 32px",
              color: "#444",
              lineHeight: 1.6,
              maxWidth: "640px",
            }}
          >
            Drone automation programming interface – design, simulate, and control autonomous
            missions with intuitive physics-enabled blocks.
          </p>
          <button
            style={{
              padding: "12px 36px",
              borderRadius: "999px",
              background: "#000",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "16px",
              transition: "transform 0.2s ease",
              pointerEvents: isDragging ? "none" : "auto",
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => navigate("/drone")}
          >
            Get Started
          </button>
        </main>
      </div>
    </section>
  );
}
