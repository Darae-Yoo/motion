class PoseMatchingGame {
    constructor() {
        this.detector = null;
        this.video = document.getElementById('webcam');
        this.canvas = document.getElementById('poseCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.targetPose = document.getElementById('targetPose');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.currentLevel = document.getElementById('currentLevel');
        this.timer = document.getElementById('timer');
        this.startBtn = document.getElementById('startBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.gameComplete = document.getElementById('gameComplete');
        this.totalTime = document.getElementById('totalTime');
        this.playAgainBtn = document.getElementById('playAgainBtn');

        this.currentLevelIndex = 0;
        this.poses = ['image/1.jpg', 'image/2.jpg', 'image/3.jpg', 'image/4.jpg'];
        this.targetPoseKeypoints = null;
        this.isGameRunning = false;
        this.startTime = null;
        this.timerInterval = null;
        this.detectionInterval = null;

        this.initializeEventListeners();
    }

    async initialize() {
        try {
            // TensorFlow.js 초기화
            await tf.ready();
            
            // 포즈 감지 모델 로드
            const model = poseDetection.SupportedModels.BlazePose;
            const detectorConfig = {
                runtime: 'tfjs',
                modelType: 'full'
            };
            this.detector = await poseDetection.createDetector(model, detectorConfig);
            
            console.log('포즈 감지 모델이 로드되었습니다.');
            this.startBtn.disabled = false;
        } catch (error) {
            console.error('모델 로드 중 오류:', error);
            alert('포즈 감지 모델을 로드할 수 없습니다. 인터넷 연결을 확인해주세요.');
        }
    }

    initializeEventListeners() {
        this.startBtn.addEventListener('click', () => this.startGame());
        this.resetBtn.addEventListener('click', () => this.resetGame());
        this.playAgainBtn.addEventListener('click', () => this.resetGame());
    }

    async startGame() {
        try {
            // 웹캠 접근
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: 640, 
                    height: 480,
                    facingMode: 'user'
                } 
            });
            this.video.srcObject = stream;
            
            // 비디오 로드 완료 대기
            this.video.addEventListener('loadeddata', () => {
                this.isGameRunning = true;
                this.startTime = Date.now();
                this.startTimer();
                this.startPoseDetection();
                this.startBtn.disabled = true;
                this.resetBtn.disabled = false;
            });

        } catch (error) {
            console.error('웹캠 접근 오류:', error);
            alert('웹캠에 접근할 수 없습니다. 웹캠 권한을 확인해주세요.');
        }
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            if (this.startTime) {
                const elapsed = Date.now() - this.startTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                this.timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    async startPoseDetection() {
        this.detectionInterval = setInterval(async () => {
            if (this.isGameRunning) {
                await this.detectPose();
            }
        }, 100); // 10 FPS
    }

    async detectPose() {
        try {
            // 현재 비디오 프레임에서 포즈 감지
            const poses = await this.detector.estimatePoses(this.video);
            
            if (poses.length > 0) {
                const currentPose = poses[0];
                this.drawPose(currentPose);
                
                // 목표 포즈와 비교
                if (this.targetPoseKeypoints) {
                    const similarity = this.calculatePoseSimilarity(currentPose, this.targetPoseKeypoints);
                    this.updateProgress(similarity);
                    
                    // 80% 이상 일치하면 다음 레벨로
                    if (similarity >= 80) {
                        this.nextLevel();
                    }
                }
            }
        } catch (error) {
            console.error('포즈 감지 오류:', error);
        }
    }

    drawPose(pose) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 스켈레톤 그리기
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 2;
        
        // 주요 관절 연결
        const connections = [
            ['nose', 'left_eye'], ['nose', 'right_eye'],
            ['left_eye', 'left_ear'], ['right_eye', 'right_ear'],
            ['left_shoulder', 'right_shoulder'],
            ['left_shoulder', 'left_elbow'], ['right_shoulder', 'right_elbow'],
            ['left_elbow', 'left_wrist'], ['right_elbow', 'right_wrist'],
            ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
            ['left_hip', 'right_hip'],
            ['left_hip', 'left_knee'], ['right_hip', 'right_knee'],
            ['left_knee', 'left_ankle'], ['right_knee', 'right_ankle']
        ];

        connections.forEach(([start, end]) => {
            const startPoint = pose.keypoints.find(kp => kp.name === start);
            const endPoint = pose.keypoints.find(kp => kp.name === end);
            
            if (startPoint && endPoint && startPoint.score > 0.3 && endPoint.score > 0.3) {
                this.ctx.beginPath();
                this.ctx.moveTo(startPoint.x, startPoint.y);
                this.ctx.lineTo(endPoint.x, endPoint.y);
                this.ctx.stroke();
            }
        });

        // 관절점 그리기
        pose.keypoints.forEach(keypoint => {
            if (keypoint.score > 0.3) {
                this.ctx.fillStyle = '#ff0000';
                this.ctx.beginPath();
                this.ctx.arc(keypoint.x, keypoint.y, 4, 0, 2 * Math.PI);
                this.ctx.fill();
            }
        });
    }

    async loadTargetPose() {
        try {
            // 목표 이미지에서 포즈 감지
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            return new Promise((resolve) => {
                img.onload = async () => {
                    const poses = await this.detector.estimatePoses(img);
                    if (poses.length > 0) {
                        this.targetPoseKeypoints = poses[0];
                        resolve();
                    } else {
                        console.warn('목표 이미지에서 포즈를 감지할 수 없습니다.');
                        resolve();
                    }
                };
                img.src = this.poses[this.currentLevelIndex];
            });
        } catch (error) {
            console.error('목표 포즈 로드 오류:', error);
        }
    }

    calculatePoseSimilarity(currentPose, targetPose) {
        if (!currentPose || !targetPose) return 0;

        let totalSimilarity = 0;
        let validKeypoints = 0;

        // 주요 관절점들의 유사도 계산
        const keyPointsToCompare = [
            'nose', 'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
            'left_wrist', 'right_wrist', 'left_hip', 'right_hip', 'left_knee',
            'right_knee', 'left_ankle', 'right_ankle'
        ];

        keyPointsToCompare.forEach(keypointName => {
            const currentKP = currentPose.keypoints.find(kp => kp.name === keypointName);
            const targetKP = targetPose.keypoints.find(kp => kp.name === keypointName);

            if (currentKP && targetKP && currentKP.score > 0.3 && targetKP.score > 0.3) {
                // 위치 유사도 계산 (정규화된 좌표 사용)
                const distance = Math.sqrt(
                    Math.pow(currentKP.x - targetKP.x, 2) + 
                    Math.pow(currentKP.y - targetKP.y, 2)
                );
                
                // 거리를 유사도로 변환 (최대 거리를 기준으로)
                const maxDistance = Math.sqrt(Math.pow(640, 2) + Math.pow(480, 2));
                const similarity = Math.max(0, 100 - (distance / maxDistance) * 100);
                
                totalSimilarity += similarity;
                validKeypoints++;
            }
        });

        return validKeypoints > 0 ? totalSimilarity / validKeypoints : 0;
    }

    updateProgress(similarity) {
        const clampedSimilarity = Math.min(100, Math.max(0, similarity));
        this.progressFill.style.width = `${clampedSimilarity}%`;
        this.progressText.textContent = `${Math.round(clampedSimilarity)}%`;
    }

    async nextLevel() {
        this.currentLevelIndex++;
        
        if (this.currentLevelIndex >= this.poses.length) {
            this.completeGame();
        } else {
            this.currentLevel.textContent = this.currentLevelIndex + 1;
            this.targetPose.src = this.poses[this.currentLevelIndex];
            this.progressFill.style.width = '0%';
            this.progressText.textContent = '0%';
            
            // 새로운 목표 포즈 로드
            await this.loadTargetPose();
        }
    }

    completeGame() {
        this.isGameRunning = false;
        clearInterval(this.timerInterval);
        clearInterval(this.detectionInterval);
        
        const totalElapsed = Date.now() - this.startTime;
        const minutes = Math.floor(totalElapsed / 60000);
        const seconds = Math.floor((totalElapsed % 60000) / 1000);
        this.totalTime.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        this.gameComplete.classList.remove('hidden');
        this.startBtn.disabled = true;
        this.resetBtn.disabled = true;
    }

    resetGame() {
        this.isGameRunning = false;
        this.currentLevelIndex = 0;
        this.startTime = null;
        
        clearInterval(this.timerInterval);
        clearInterval(this.detectionInterval);
        
        this.currentLevel.textContent = '1';
        this.timer.textContent = '00:00';
        this.targetPose.src = this.poses[0];
        this.progressFill.style.width = '0%';
        this.progressText.textContent = '0%';
        
        this.gameComplete.classList.add('hidden');
        this.startBtn.disabled = false;
        this.resetBtn.disabled = true;
        
        // 웹캠 스트림 정리
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
        }
        
        // 캔버스 클리어
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 목표 포즈 다시 로드
        this.loadTargetPose();
    }
}

// 게임 초기화
document.addEventListener('DOMContentLoaded', async () => {
    const game = new PoseMatchingGame();
    await game.initialize();
    
    // 초기 목표 포즈 로드
    await game.loadTargetPose();
});
