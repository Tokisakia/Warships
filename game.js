document.addEventListener('DOMContentLoaded', () => {

    // --- 视频和菜单逻辑 ---
    const videoOverlay = document.getElementById('video-overlay');
    const video = document.getElementById('intro-video');
    const difficultyScreen = document.getElementById('difficulty-screen');
    const gameContainer = document.getElementById('game-container');
    const controls = document.getElementById('controls');

    function skipIntro() {
        if (videoOverlay.classList.contains('hidden')) return; 
        videoOverlay.classList.add('hidden');
        difficultyScreen.classList.remove('hidden');
        video.pause();
    }
    
    // 视频结束或被跳过
    video.addEventListener('ended', skipIntro);
    document.addEventListener('keydown', skipIntro, { once: true });
    videoOverlay.addEventListener('click', skipIntro, { once: true });


    // --- 常量 ---
    const GRID_SIZE = 10;
    // 新的舰艇定义
    const PLAYER_SHIPS = [
        { id: 'p_sub_1', name: '潜艇 (射水鱼)', width: 1, height: 2 },
        { id: 'p_des_1', name: '驱逐舰 (基林)', width: 1, height: 3 },
        { id: 'p_des_2', name: '驱逐舰 (索莫斯)', width: 1, height: 3 },
        { id: 'p_cru_1', name: '巡洋舰 (得梅因)', width: 1, height: 4 },
        { id: 'p_bat_1', name: '战列舰 (蒙大拿)', width: 1, height: 5 }
    ];
    const AI_SHIPS = [
        { id: 'ai_sub_1', name: '潜艇 (i56)', width: 1, height: 2 },
        { id: 'ai_des_1', name: '驱逐舰 (岛风)', width: 1, height: 3 },
        { id: 'ai_des_2', name: '驱逐舰 (疾风)', width: 1, height: 3 },
        { id: 'ai_cru_1', name: '巡洋舰 (藏王)', width: 1, height: 4 },
        { id: 'ai_bat_1', name: '战列舰 (大和)', width: 1, height: 5 }
    ];
    
    const TOTAL_SHIP_CELLS = PLAYER_SHIPS.reduce((sum, ship) => sum + (ship.width * ship.height), 0); // 2+3+3+4+5 = 17

    // --- DOM 元素 ---
    const playerGrid = document.getElementById('player-grid');
    const aiGrid = document.getElementById('ai-grid');
    const shipDock = document.getElementById('ship-dock');
    const confirmBtn = document.getElementById('confirm-placement-btn');
    const startTurnBtn = document.getElementById('start-player-turn-btn');
    const statusMsg = document.getElementById('status-message');
    const playerBoardContainer = document.getElementById('player-board-container');
    const aiBoardContainer = document.getElementById('ai-board-container');
    const easyBtn = document.getElementById('easy-btn');
    const mediumBtn = document.getElementById('medium-btn');
    const hardBtn = document.getElementById('hard-btn');
    const gameBGM = document.getElementById('game-bgm');

    // --- 游戏状态变量 ---
    let playerGridModel = createEmptyGridModel();
    let aiGridModel = createEmptyGridModel();
    let shipsToPlace = [];
    let draggedShip = null;
    let draggedShipOffset = { x: 0, y: 0 };
    let gameState = 'init';
    
    let aiTurnCount = 0;
    let playerTurnCount = 0;
    let aiHits = 0;
    let playerHits = 0;
    let playerSunkShips = new Set();
    let aiSunkShips = new Set();


    // --- AI 状态变量 ---
    let aiDifficulty = 'easy';
    let aiGuesses = new Set(); 
    let aiState = 'searching'; 
    let aiHuntQueue = []; 
    let aiHitBuffer = []; 
    let aiHuntDirection = null; 
    let aiLastHit = null;
    let aiHardSearchPattern = []; 


    // ===================================================================
    // 游戏启动与流程
    // ===================================================================

    // 绑定难度按钮事件
    easyBtn.addEventListener('click', () => startGame('easy'));
    mediumBtn.addEventListener('click', () => startGame('medium'));
    hardBtn.addEventListener('click', () => startGame('hard'));

    /** 开始新游戏 (由难度按钮触发) */
    function startGame(difficulty) {
        aiDifficulty = difficulty;
        gameState = 'placement';
        
        // 播放 BGM
        gameBGM.currentTime = 0; 
        gameBGM.play().catch(e => console.warn("BGM 播放失败，可能是浏览器限制，请用户互动后重试。"));

        // 切换界面
        difficultyScreen.classList.add('hidden'); // 隐藏难度选择
        gameContainer.classList.remove('hidden'); // 显示游戏容器
        controls.classList.remove('hidden');
        statusMsg.classList.remove('hidden');
        
        initGame();
    }

    /** 游戏初始化 */
    function initGame() {
        // 1. 创建网格 DOM
        createGridDOM(playerGrid, 'p');
        createGridDOM(aiGrid, 'ai');

        // 2. 重置状态变量
        playerGridModel = createEmptyGridModel();
        aiGridModel = createEmptyGridModel();
        shipsToPlace = [...PLAYER_SHIPS]; // 使用新的舰艇定义
        aiTurnCount = 0;
        playerTurnCount = 0;
        aiHits = 0;
        playerHits = 0;
        draggedShip = null; 
        playerSunkShips.clear();
        aiSunkShips.clear();

        // 3. 重置 AI 状态
        aiGuesses.clear();
        aiState = 'searching';
        aiHuntQueue = [];
        aiHitBuffer = []; 
        aiHuntDirection = null;
        aiLastHit = null;
        if (aiDifficulty === 'hard') {
            createHardSearchPattern();
        }

        // 4. 重置界面
        createShipDock(); 
        playerBoardContainer.classList.remove('hidden');
        aiBoardContainer.classList.add('hidden');
        
        // 确保备选栏可见
        shipDock.classList.remove('hidden'); 
        
        confirmBtn.classList.remove('hidden');
        confirmBtn.disabled = true;
        startTurnBtn.classList.add('hidden');
        updateStatus('请从左侧拖动舰艇到你的海域进行部署。');

        // 5. 添加事件监听 (必须在 createShipDock 之后调用)
        addDragDropListeners();
        confirmBtn.onclick = handleConfirmPlacement;
        startTurnBtn.onclick = handleStartPlayerTurn;
    }

    /** 创建 10x10 逻辑模型 (0 = empty) */
    function createEmptyGridModel() { 
        return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0)); 
    }

    /** 创建 10x10 网格 DOM */
    function createGridDOM(container, prefix) {
        container.innerHTML = '';
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const cell = document.createElement('div');
                cell.classList.add('grid-cell');
                cell.dataset.row = r;
                cell.dataset.col = c;
                cell.id = `${prefix}-${r}-${c}`;
                if (prefix === 'ai') {
                    cell.addEventListener('click', handlePlayerAttack);
                }
                container.appendChild(cell);
            }
        }
    }

    /** 创建备选栏舰艇 (已修改) */
    function createShipDock() {
        shipDock.innerHTML = '<h3>你的舰队 (点击旋转)</h3>';
        shipsToPlace.forEach(shipDef => {
            // 添加舰艇名称
            const label = document.createElement('div');
            label.classList.add('ship-item-label');
            label.textContent = shipDef.name;
            shipDock.appendChild(label);
            
            // 创建舰艇
            const shipItem = document.createElement('div');
            shipItem.id = `dock-${shipDef.id}`; // 使用 id
            shipItem.classList.add('ship-item');
            shipItem.draggable = true;
            shipItem.dataset.id = shipDef.id; // 存储 id
            shipItem.dataset.name = shipDef.name; // 存储 name
            shipItem.dataset.width = shipDef.width;
            shipItem.dataset.height = shipDef.height;
            updateShipItemVisuals(shipItem, shipDef.width, shipDef.height);
            shipDock.appendChild(shipItem);
            shipItem.addEventListener('click', () => handleShipRotate(shipItem));
        });
    }

    /** 更新备选栏中舰艇的视觉样式 (用于旋转) */
    function updateShipItemVisuals(shipItem, width, height) {
        shipItem.style.width = `${width * 30}px`;
        shipItem.style.height = `${height * 30}px`;
        shipItem.innerHTML = '';
        for(let i = 0; i < width * height; i++) {
            const cell = document.createElement('div');
            cell.classList.add('ship-cell');
            shipItem.appendChild(cell);
        }
    }
    
    // ===================================================================
    // 拖放 (Drag & Drop) 逻辑 (已修复)
    // ===================================================================
    
    function addDragDropListeners() {
        const ships = shipDock.querySelectorAll('.ship-item');
        ships.forEach(ship => {
            ship.removeEventListener('dragstart', handleDragStart);
            ship.addEventListener('dragstart', handleDragStart);
            ship.removeEventListener('dragend', handleDragEnd); 
            ship.addEventListener('dragend', handleDragEnd);
        });

        const playerCells = playerGrid.querySelectorAll('.grid-cell');
        playerCells.forEach(cell => {
            cell.removeEventListener('dragover', handleDragOver);
            cell.removeEventListener('dragenter', handleDragEnter);
            cell.removeEventListener('dragleave', handleDragLeave);
            cell.removeEventListener('drop', handleDrop);
            
            cell.addEventListener('dragover', handleDragOver);
            cell.addEventListener('dragenter', handleDragEnter);
            cell.addEventListener('dragleave', handleDragLeave);
            cell.addEventListener('drop', handleDrop);
        });
    }

    /** 拖动开始 */
    function handleDragStart(e) {
        draggedShip = e.target.closest('.ship-item'); 
        
        if (!draggedShip) {
            e.preventDefault(); 
            return;
        }

        draggedShip.classList.add('dragging');

        const rect = draggedShip.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;
        
        draggedShipOffset.x = Math.floor(offsetX / 30);
        draggedShipOffset.y = Math.floor(offsetY / 30);
        
        e.dataTransfer.setData('text/plain', draggedShip.id);
    }

    /** 拖动结束 */
    function handleDragEnd(e) {
        if (draggedShip) {
            draggedShip.classList.remove('dragging');
            clearAllPreviews();
            draggedShip = null;
        }
    }

    function handleDragOver(e) { e.preventDefault(); previewPlacement(e.target, true); }
    function handleDragEnter(e) { e.preventDefault(); previewPlacement(e.target, true); }
    function handleDragLeave(e) { previewPlacement(e.target, false); }
    
    /** 拖动释放 (已修改) */
    function handleDrop(e) {
        e.preventDefault();
        const cell = e.target;
        
        if (!draggedShip) return;

        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        
        const ship = { 
            id: draggedShip.dataset.id, // 获取 id
            name: draggedShip.dataset.name, 
            width: parseInt(draggedShip.dataset.width), 
            height: parseInt(draggedShip.dataset.height) 
        };
        const startRow = row - draggedShipOffset.y;
        const startCol = col - draggedShipOffset.x;
        
        previewPlacement(cell, false); 

        if (isValidPlacement(playerGridModel, ship, startRow, startCol)) {
            placeShipOnModel(playerGridModel, ship, startRow, startCol); // 传递 ship 对象
            placeShipOnGrid(playerGrid, ship, startRow, startCol);
            
            // 移除对应的标签和舰艇
            const label = shipDock.querySelector(`.ship-item-label:nth-of-type(${shipsToPlace.findIndex(s => s.id === ship.id) + 1})`);
            if(label) label.remove();
            draggedShip.remove();
            
            shipsToPlace = shipsToPlace.filter(s => s.id !== ship.id); // 比较 id
            if (shipsToPlace.length === 0) {
                confirmBtn.disabled = false;
                updateStatus('所有舰艇已部署！请确认。');
            }
        } else {
            updateStatus('无效的放置位置！(越界或重叠)');
            setTimeout(() => updateStatus('请继续部署...'), 2000);
        }
        
        draggedShip.classList.remove('dragging');
        draggedShip = null;
    }
    
    /** 旋转舰艇 */
    function handleShipRotate(shipItem) {
        const currentWidth = parseInt(shipItem.dataset.width);
        const currentHeight = parseInt(shipItem.dataset.height);
        
        shipItem.dataset.width = currentHeight;
        shipItem.dataset.height = currentWidth;
        
        updateShipItemVisuals(shipItem, currentHeight, currentWidth);
    }
    
    // ===================================================================
    // 放置 (Placement) 逻辑
    // ===================================================================

    /** 清除所有预览高亮 */
    function clearAllPreviews() {
        const cells = playerGrid.querySelectorAll('.drag-over, .drag-over-invalid');
        cells.forEach(c => {
            c.classList.remove('drag-over', 'drag-over-invalid');
        });
    }

    /** 预览放置 (高亮网格) */
    function previewPlacement(cell, show) {
        if (!draggedShip) return;

        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);

        const ship = {
            width: parseInt(draggedShip.dataset.width),
            height: parseInt(draggedShip.dataset.height)
        };

        const startRow = row - draggedShipOffset.y;
        const startCol = col - draggedShipOffset.x;

        clearAllPreviews();
        if (!show) return;

        const isValid = isValidPlacement(playerGridModel, ship, startRow, startCol);
        const classToAdd = isValid ? 'drag-over' : 'drag-over-invalid';

        for (let r = 0; r < ship.height; r++) {
            for (let c = 0; c < ship.width; c++) {
                const targetRow = startRow + r;
                const targetCol = startCol + c;
                if (targetRow >= 0 && targetRow < GRID_SIZE && targetCol >= 0 && targetCol < GRID_SIZE) {
                    const targetCell = playerGrid.querySelector(`[data-row="${targetRow}"][data-col="${targetCol}"]`);
                    if (targetCell) {
                        targetCell.classList.add(classToAdd);
                    }
                }
            }
        }
    }

    /** 检查是否可以放置 (模型中 0 为空) */
    function isValidPlacement(gridModel, ship, startRow, startCol) {
        if (startRow < 0 || startRow + ship.height > GRID_SIZE || startCol < 0 || startCol + ship.width > GRID_SIZE) {
            return false;
        }
        for (let r = 0; r < ship.height; r++) {
            for (let c = 0; c < ship.width; c++) {
                if (gridModel[startRow + r][startCol + c] !== 0) { return false; } // 0 是空
            }
        }
        return true;
    }
    
    /** 放置到逻辑模型 (已修改) */
    function placeShipOnModel(gridModel, ship, startRow, startCol) {
        for (let r = 0; r < ship.height; r++) {
            for (let c = 0; c < ship.width; c++) {
                gridModel[startRow + r][startCol + c] = ship.id; // 存储舰艇 ID
            }
        }
    }
    
    /** 放置到视觉网格 */
    function placeShipOnGrid(gridDOM, ship, startRow, startCol) {
        for (let r = 0; r < ship.height; r++) {
            for (let c = 0; c < ship.width; c++) {
                const cell = gridDOM.querySelector(`[data-row="${startRow + r}"][data-col="${startCol + c}"]`);
                if (cell) { cell.classList.add('ship'); }
            }
        }
    }

    /** 放置 AI 舰艇 (已修改) */
    function placeAiShips() {
        aiGridModel = createEmptyGridModel();
        const aiShips = [...AI_SHIPS];
        for (const ship of aiShips) {
            let placed = false;
            while (!placed) {
                let w = ship.width, h = ship.height;
                if (Math.random() < 0.5) { [w, h] = [h, w]; }
                const r = Math.floor(Math.random() * GRID_SIZE);
                const c = Math.floor(Math.random() * GRID_SIZE);
                
                const shipData = { width: w, height: h, id: ship.id };
                
                if (isValidPlacement(aiGridModel, shipData, r, c)) {
                    placeShipOnModel(aiGridModel, shipData, r, c);
                    placed = true;
                }
            }
        }
    }
    
    // ===================================================================
    // 游戏流程 & AI 逻辑 (AI 逻辑保持上一次优化后的版本)
    // ===================================================================

    /** 玩家确认部署 */
    function handleConfirmPlacement() {
        gameState = 'ai-attack';
        confirmBtn.classList.add('hidden');
        shipDock.classList.add('hidden'); 
        placeAiShips();
        updateStatus(`AI 回合 (${aiDifficulty})：正在搜索...`);
        setTimeout(aiAttackLoop, 1000);
    }

    /** 玩家开始攻击 AI */
    function handleStartPlayerTurn() {
        gameState = 'player-attack';
        startTurnBtn.classList.add('hidden');
        playerBoardContainer.classList.add('hidden');
        aiBoardContainer.classList.remove('hidden');
        updateStatus('你的回合：点击 AI 海域的格子发动攻击！');
    }
    
    /** 新增: 检查舰艇是否被击沉 (通用) */
    function isSunk(gridModel, shipId) {
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (gridModel[r][c] === shipId) {
                    return false; // 找到一个未被击中的部分
                }
            }
        }
        return true; // 没有找到未被击中的部分
    }


    /** 玩家点击攻击 (已修改) */
    function handlePlayerAttack(e) {
        if (gameState !== 'player-attack') return;
        const cell = e.target;
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        const cellValue = aiGridModel[r][c];

        // 2 = miss, _hit = 已经击中
        if (cellValue === 2 || String(cellValue).endsWith('_hit')) {
            updateStatus('你已经攻击过这个位置了！');
            return;
        }
        
        playerTurnCount++;
        
        if (cellValue !== 0) { // 击中 (cellValue 是 shipId)
            const shipId = cellValue;
            aiGridModel[r][c] = shipId + '_hit';
            cell.classList.add('hit');
            playerHits++;
            
            const shipName = AI_SHIPS.find(s => s.id === shipId).name;

            // 检查是否击沉
            if (isSunk(aiGridModel, shipId) && !aiSunkShips.has(shipId)) {
                aiSunkShips.add(shipId);
                updateStatus(`你击沉了敌方 ${shipName} 舰船！ (第 ${playerTurnCount} 步)`);
            } else {
                updateStatus(`你的回合：击中！(第 ${playerTurnCount} 步)`);
            }
            
        } else { // 未击中 (cellValue === 0)
            aiGridModel[r][c] = 2; // 2 = miss
            cell.classList.add('miss');
            updateStatus(`你的回合：未击中。(第 ${playerTurnCount} 步)`);
        }
        
        if (playerHits === TOTAL_SHIP_CELLS) {
            gameState = 'game-over';
            endGame();
        }
    }

    /** 游戏结束 */
    function endGame() {
        gameBGM.pause();
        gameBGM.currentTime = 0;
        
        aiBoardContainer.classList.add('hidden');
        
        gameContainer.classList.add('hidden');
        controls.classList.add('hidden');
        difficultyScreen.classList.remove('hidden'); // 显示难度选择

        let finalMsg = `游戏结束！你用了 ${playerTurnCount} 步，AI (${aiDifficulty}) 用了 ${aiTurnCount} 步。`;
        if (playerHits === TOTAL_SHIP_CELLS && aiHits < TOTAL_SHIP_CELLS) {
             finalMsg += " 恭喜你，你赢了！";
        } else if (aiHits === TOTAL_SHIP_CELLS && playerHits < TOTAL_SHIP_CELLS) {
             finalMsg += " 很遗憾，AI 赢了。";
        } else {
             finalMsg += " 平局！"; // 理论上不太可能，因为玩家先攻
        }
        finalMsg += "\n请选择难度开始新一局。";
        updateStatus(finalMsg);
    }
    
    /** AI 攻击主循环 (已修改) */
    function aiAttackLoop() {
        if (gameState !== 'ai-attack') return;

        const target = aiGetNextTarget();
        const { r, c } = target;

        aiGuesses.add(`${r},${c}`);
        aiTurnCount++;

        const cell = document.getElementById(`p-${r}-${c}`);
        const cellValue = playerGridModel[r][c];

        // 0 = empty, 2 = miss
        if (cellValue !== 0 && cellValue !== 2) { // 击中 (cellValue 是 shipId)
            const shipId = cellValue;
            playerGridModel[r][c] = shipId + '_hit';
            cell.classList.add('hit');
            aiHits++;
            
            // 默认显示击中，checkSunk 会覆盖此消息
            updateStatus(`AI 回合：击中！(第 ${aiTurnCount} 步)`);
            
            aiProcessHit(r, c);
            checkSunk(r, c, shipId); // 检查是否击沉

        } else { // 未击中
            playerGridModel[r][c] = 2;
            cell.classList.add('miss');
            updateStatus(`AI 回合：未击中。(第 ${aiTurnCount} 步)`);
        }

        if (aiHits === TOTAL_SHIP_CELLS) {
            gameState = 'player-turn-transition';
            updateStatus(`AI 在 ${aiTurnCount} 步内找到了你的所有舰艇！`);
            startTurnBtn.classList.remove('hidden');
        } else {
            setTimeout(aiAttackLoop, 400); 
        }
    }
    
    // (aiGetNextTarget, aiProcessHit 保持不变)
    
    function aiGetNextTarget() {
        if (aiState === 'hunting' && aiHuntQueue.length > 0) {
            while (aiHuntQueue.length > 0) {
                const target = aiHuntQueue.pop(); 
                if (!aiGuesses.has(`${target.r},${target.c}`)) {
                    return target;
                }
            }
            aiState = 'searching';
        }
        
        if (aiDifficulty === 'hard' && aiHitBuffer.length > 0) {
            aiState = 'hunting';
            aiHuntDirection = null; 
            const { r, c } = aiHitBuffer[0];
            addAdjacentToHuntQueue(r, c);
            
            while (aiHuntQueue.length > 0) {
                const target = aiHuntQueue.pop(); 
                if (!aiGuesses.has(`${target.r},${target.c}`)) {
                    return target;
                }
            }
            aiState = 'searching';
        }

        let r, c;
        if (aiDifficulty === 'hard' && aiHardSearchPattern.length > 0) {
            let target;
            do {
                 target = aiHardSearchPattern.pop();
            } while(target && aiGuesses.has(`${target.r},${target.c}`));
            
            if (target) {
                r = target.r;
                c = target.c;
            } else {
                do {
                    r = Math.floor(Math.random() * GRID_SIZE);
                    c = Math.floor(Math.random() * GRID_SIZE);
                } while (aiGuesses.has(`${r},${c}`));
            }

        } else {
            do {
                r = Math.floor(Math.random() * GRID_SIZE);
                c = Math.floor(Math.random() * GRID_SIZE);
            } while (aiGuesses.has(`${r},${c}`));
        }
        
        return { r, c };
    }

    function aiProcessHit(r, c) {
        if (aiDifficulty === 'easy') return; 

        aiState = 'hunting';
        aiHitBuffer.push({ r, c }); 
        
        if (aiDifficulty === 'medium') {
            addAdjacentToHuntQueue(r, c);
        }
        
        else if (aiDifficulty === 'hard') {
            const hits = aiHitBuffer;
            
            if (hits.length === 1) {
                addAdjacentToHuntQueue(r, c);
            } else {
                let lastHit = aiLastHit;
                if (!lastHit || (!hits.some(h => h.r === lastHit.r && h.c === lastHit.c))) {
                    lastHit = hits[hits.length - 2]; 
                }

                if (lastHit) {
                    if (r === lastHit.r) aiHuntDirection = 'h'; 
                    else if (c === lastHit.c) aiHuntDirection = 'v';
                }
                
                if (aiHuntDirection) {
                    aiHuntQueue = []; 
                    
                    const lineHits = hits.filter(h => 
                        (aiHuntDirection === 'h' && h.r === r) || 
                        (aiHuntDirection === 'v' && h.c === c)
                    );

                    const coords = lineHits.map(h => aiHuntDirection === 'h' ? h.c : h.r);
                    const minCoord = Math.min(...coords);
                    const maxCoord = Math.max(...coords);

                    const target1 = {
                        r: aiHuntDirection === 'h' ? r : minCoord - 1,
                        c: aiHuntDirection === 'h' ? minCoord - 1 : c
                    };
                    const target2 = {
                        r: aiHuntDirection === 'h' ? r : maxCoord + 1,
                        c: aiHuntDirection === 'h' ? maxCoord + 1 : c
                    };

                    pushToHuntQueue(target1.r, target1.c);
                    pushToHuntQueue(target2.r, target2.c);
                } else {
                     addAdjacentToHuntQueue(r, c);
                }
            }
        }
        aiLastHit = { r, c };
    }
    
    /** AI 检查是否击沉 (已重写) */
    function checkSunk(r, c, shipId) {
        
        // 如果这艘船已经被标记为击沉，则跳过
        if (playerSunkShips.has(shipId)) return true;
        
        // 使用 isSunk 辅助函数检查
        if (isSunk(playerGridModel, shipId)) {
            
            playerSunkShips.add(shipId);
            const shipName = PLAYER_SHIPS.find(s => s.id === shipId).name;
            updateStatus(`我方 ${shipName} 舰船被击沉了！ (AI 第 ${aiTurnCount} 步)`);
            
            // 重置 AI 索敌逻辑
            // 从 aiHitBuffer 中移除所有属于这艘船的坐标
            aiHitBuffer = aiHitBuffer.filter(hit => {
                const hitId = playerGridModel[hit.r][hit.c];
                return !hitId.startsWith(shipId); // 移除 'p_sub_1_hit'
            });
            
            if (aiHitBuffer.length === 0) {
                // 如果缓冲区空了，AI 回到搜索模式
                aiState = 'searching';
                aiHuntQueue = [];
                aiHuntDirection = null;
                aiLastHit = null;
            } else {
                // 如果缓冲区还有其他船的命中点，继续猎杀
                aiState = 'hunting';
                aiHuntQueue = []; // 重置队列，aiGetNextTarget 会根据 buffer 重建
                aiHuntDirection = null; 
                aiLastHit = null; // 丢失了上一艘船的上下文
            }
            return true;
        }
        return false;
    }

    // (getConnectedShipCells 函数已被删除)
    
    function addAdjacentToHuntQueue(r, c) {
        pushToHuntQueue(r + 1, c);
        pushToHuntQueue(r - 1, c);
        pushToHuntQueue(r, c + 1);
        pushToHuntQueue(r, c - 1);
    }
    
    function pushToHuntQueue(r, c) {
        if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && !aiGuesses.has(`${r},${c}`)) {
            if (!aiHuntQueue.some(item => item.r === r && item.c === c)) {
                aiHuntQueue.push({ r, c });
            }
        }
    }
    
    function createHardSearchPattern() {
        aiHardSearchPattern = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if ((r + c) % 2 === 0) { 
                    aiHardSearchPattern.push({ r, c });
                }
            }
        }
        shuffleArray(aiHardSearchPattern);
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function updateStatus(message) {
        statusMsg.textContent = message;
    }
});