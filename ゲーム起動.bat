@echo off
cd /d "%~dp0"
echo ================================================
echo   人狼ドッチ を起動します
echo   この黒い画面はゲーム中は閉じないでください
echo   （ゲームサーバとして動いています）
echo ================================================
where python >nul 2>nul
if %errorlevel%==0 goto run_python
where py >nul 2>nul
if %errorlevel%==0 goto run_py
echo.
echo Python が見つかりませんでした。
echo https://www.python.org からインストールするか、
echo GitHub Pages に公開したURLで遊んでください。
pause
exit /b

:run_python
start "" http://localhost:8000
echo ブラウザが開かない場合は http://localhost:8000 を開いてください
python -m http.server 8000
goto end

:run_py
start "" http://localhost:8000
echo ブラウザが開かない場合は http://localhost:8000 を開いてください
py -m http.server 8000

:end
pause