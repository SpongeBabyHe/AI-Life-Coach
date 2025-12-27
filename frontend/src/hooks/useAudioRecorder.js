/**
 * 音频录制 Hook
 * 
 * 使用 MediaRecorder API 实现浏览器内录音功能
 * 支持开始、暂停、恢复、停止录音
 * 自动生成音频文件（Blob）
 */

import { useState, useRef, useEffect } from 'react';

const RECORDING_STATES = {
  IDLE: 'idle',           // 空闲状态
  RECORDING: 'recording', // 正在录音
  PAUSED: 'paused',       // 暂停录音
  STOPPED: 'stopped'      // 已停止
};

/**
 * 音频录制 Hook
 * @returns {Object} 录音控制函数和状态
 */
export const useAudioRecorder = () => {
  const [recordingState, setRecordingState] = useState(RECORDING_STATES.IDLE);
  const [recordingTime, setRecordingTime] = useState(0); // 录音时长（秒）
  const [error, setError] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null); // 录制完成的音频 Blob

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // 清理函数
  useEffect(() => {
    return () => {
      // 组件卸载时清理资源
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  /**
   * 检查浏览器是否支持 MediaRecorder
   */
  const checkSupport = () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('您的浏览器不支持录音功能，请使用现代浏览器（Chrome、Firefox、Safari 等）');
    }
    if (!window.MediaRecorder) {
      throw new Error('您的浏览器不支持 MediaRecorder API');
    }
  };

  /**
   * 获取支持的音频 MIME 类型
   */
  const getSupportedMimeType = () => {
    const types = [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/ogg;codecs=opus',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav'
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    // 如果都不支持，返回空字符串，让浏览器使用默认格式
    return '';
  };

  /**
   * 开始录音
   */
  const startRecording = async () => {
    try {
      setError(null);
      checkSupport();

      // 获取用户媒体流（麦克风权限）
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;

      // 创建 MediaRecorder 实例
      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : {};

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // 监听数据可用事件
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // 监听停止事件
      mediaRecorder.onstop = () => {
        // 创建 Blob 对象
        const blob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm'
        });
        setAudioBlob(blob);
        setRecordingState(RECORDING_STATES.STOPPED);

        // 停止所有媒体轨道
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      // 监听错误事件
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('录音过程中发生错误');
        stopRecording();
      };

      // 开始录音
      mediaRecorder.start(100); // 每 100ms 收集一次数据
      setRecordingState(RECORDING_STATES.RECORDING);

      // 开始计时
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('开始录音失败:', err);
      setError(err.message || '无法访问麦克风，请检查权限设置');
      setRecordingState(RECORDING_STATES.IDLE);
    }
  };

  /**
   * 暂停录音
   */
  const pauseRecording = () => {
    if (mediaRecorderRef.current && recordingState === RECORDING_STATES.RECORDING) {
      mediaRecorderRef.current.pause();
      setRecordingState(RECORDING_STATES.PAUSED);

      // 暂停计时
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  /**
   * 恢复录音
   */
  const resumeRecording = () => {
    if (mediaRecorderRef.current && recordingState === RECORDING_STATES.PAUSED) {
      mediaRecorderRef.current.resume();
      setRecordingState(RECORDING_STATES.RECORDING);

      // 恢复计时
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  };

  /**
   * 停止录音
   */
  const stopRecording = () => {
    if (mediaRecorderRef.current &&
      (recordingState === RECORDING_STATES.RECORDING ||
        recordingState === RECORDING_STATES.PAUSED)) {
      mediaRecorderRef.current.stop();

      // 停止计时
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  /**
   * 重置录音状态
   */
  const resetRecording = () => {
    // 如果正在录音，先停止
    if (recordingState === RECORDING_STATES.RECORDING ||
      recordingState === RECORDING_STATES.PAUSED) {
      stopRecording();
    }

    // 清理资源
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // 重置状态
    setRecordingState(RECORDING_STATES.IDLE);
    setRecordingTime(0);
    setAudioBlob(null);
    setError(null);
    chunksRef.current = [];
    mediaRecorderRef.current = null;
  };

  /**
   * 将 Blob 转换为 File 对象
   * @param {string} filename - 文件名
   * @returns {File|null} File 对象或 null
   */
  const getAudioFile = (filename = 'recording.webm') => {
    if (!audioBlob) {
      return null;
    }

    // 根据 MIME 类型确定文件扩展名
    let extension = 'webm';
    if (audioBlob.type.includes('mp4')) {
      extension = 'm4a';
    } else if (audioBlob.type.includes('ogg')) {
      extension = 'ogg';
    } else if (audioBlob.type.includes('wav')) {
      extension = 'wav';
    }

    const finalFilename = filename.replace(/\.[^.]+$/, `.${extension}`);

    return new File([audioBlob], finalFilename, {
      type: audioBlob.type || 'audio/webm'
    });
  };

  /**
   * 格式化录音时长（秒 -> MM:SS）
   */
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    // 状态
    recordingState,
    recordingTime,
    formattedTime: formatTime(recordingTime),
    error,
    audioBlob,
    isRecording: recordingState === RECORDING_STATES.RECORDING,
    isPaused: recordingState === RECORDING_STATES.PAUSED,
    isIdle: recordingState === RECORDING_STATES.IDLE,
    hasRecording: !!audioBlob,

    // 控制函数
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
    getAudioFile,

    // 常量
    RECORDING_STATES
  };
};
