import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { analyzeContent } from './apiService';
import { useAudioRecorder } from './hooks/useAudioRecorder';

function App() {
  const [textInput, setTextInput] = useState('');
  const [imageFiles, setImageFiles] = useState([]);
  const [audioFiles, setAudioFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!textInput.trim() && imageFiles.length === 0 && audioFiles.length === 0) {
      alert('请至少提供文本、图片或语音中的一种输入');
      return;
    }

    setIsLoading(true);

    try {
      const response = await analyzeContent({
        text: textInput,
        imageFiles: imageFiles.length > 0 ? imageFiles : undefined,
        audioFiles: audioFiles.length > 0 ? audioFiles : undefined
      });

      setResult(response.data);
    } catch (error) {
      console.error('提交错误:', error);
      const errorMessage = error.response?.data?.message || error.message || '提交失败，请重试';
      alert(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setImageFiles(files.slice(0, 5));
    }
  };

  const removeImage = (index) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleAudioChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setAudioFiles(files.slice(0, 3));
    }
  };

  const removeAudio = (index) => {
    setAudioFiles(prev => prev.filter((_, i) => i !== index));
  };

  const {
    recordingState,
    formattedTime,
    error: recordingError,
    isRecording,
    isPaused,
    isIdle,
    hasRecording,
    audioBlob,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
    getAudioFile,
    RECORDING_STATES
  } = useAudioRecorder();

  const processedBlobRef = useRef(null);

  useEffect(() => {
    if (isIdle && !audioBlob) {
      processedBlobRef.current = null;
    }
  }, [isIdle, audioBlob]);

  useEffect(() => {
    if (audioBlob && recordingState === RECORDING_STATES.STOPPED && processedBlobRef.current !== audioBlob) {
      processedBlobRef.current = audioBlob;

      if (audioFiles.length >= 3) {
        alert('最多只能添加3个音频文件，请先移除一些文件');
        resetRecording();
        processedBlobRef.current = null;
        return;
      }

      const audioFile = getAudioFile(`recording_${Date.now()}.webm`);
      if (audioFile) {
        setAudioFiles(prev => [...prev, audioFile]);
        resetRecording();
      } else {
        processedBlobRef.current = null;
      }
    }
  }, [audioBlob, recordingState, audioFiles.length, getAudioFile, resetRecording, RECORDING_STATES]);

  const handleStopRecording = () => {
    stopRecording();
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>AI Life Coach</h1>
      </header>

      <main>
        <form onSubmit={handleSubmit}>
          <div className="input-section">
            <label>文本内容（可选）</label>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="输入你的内容..."
              rows={6}
            />
          </div>

          <div className="input-section">
            <label>图片（可选，最多5张）</label>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif"
              multiple
              onChange={handleImageChange}
            />
            {imageFiles.length > 0 && (
              <div className="file-list">
                {imageFiles.map((file, index) => (
                  <div key={index} className="file-item">
                    <span>{file.name}</span>
                    <button type="button" onClick={() => removeImage(index)}>移除</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="input-section">
            <label>音频（可选，最多3个）</label>
            <input
              type="file"
              accept="audio/mp3,audio/wav,audio/m4a,audio/webm,audio/ogg"
              multiple
              onChange={handleAudioChange}
              disabled={audioFiles.length >= 3}
            />
            {audioFiles.length > 0 && (
              <div className="file-list">
                {audioFiles.map((file, index) => (
                  <div key={index} className="file-item">
                    <span>{file.name}</span>
                    <button type="button" onClick={() => removeAudio(index)}>移除</button>
                  </div>
                ))}
              </div>
            )}

            <div className="recording-section">
              <div className="recording-controls">
                {isIdle && (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="record-button start-button"
                    disabled={audioFiles.length >= 3}
                  >
                    🎤 开始录音
                  </button>
                )}

                {isRecording && (
                  <>
                    <div className="recording-status">
                      <span className="recording-indicator">●</span>
                      <span className="recording-time">{formattedTime}</span>
                    </div>
                    <div className="recording-actions">
                      <button
                        type="button"
                        onClick={pauseRecording}
                        className="record-button pause-button"
                      >
                        ⏸ 暂停
                      </button>
                      <button
                        type="button"
                        onClick={handleStopRecording}
                        className="record-button stop-button"
                      >
                        ⏹ 停止
                      </button>
                    </div>
                  </>
                )}

                {isPaused && (
                  <>
                    <div className="recording-status">
                      <span className="recording-time paused">{formattedTime}</span>
                    </div>
                    <div className="recording-actions">
                      <button
                        type="button"
                        onClick={resumeRecording}
                        className="record-button resume-button"
                      >
                        ▶ 继续
                      </button>
                      <button
                        type="button"
                        onClick={handleStopRecording}
                        className="record-button stop-button"
                      >
                        ⏹ 停止
                      </button>
                    </div>
                  </>
                )}

                {hasRecording && !isRecording && !isPaused && (
                  <div className="recording-preview">
                    <span>录音完成</span>
                    <button
                      type="button"
                      onClick={resetRecording}
                      className="record-button cancel-button"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>

              {recordingError && (
                <div className="recording-error">
                  ⚠️ {recordingError}
                </div>
              )}

              {audioFiles.length >= 3 && (
                <div className="recording-warning">
                  已达到最大音频数量限制（3个）
                </div>
              )}
            </div>
          </div>

          <button type="submit" disabled={isLoading}>
            {isLoading ? '分析中...' : '提交分析'}
          </button>
        </form>

        {result && (
          <div className="result">
            <h2>分析结果</h2>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

