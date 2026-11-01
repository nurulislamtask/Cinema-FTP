package com.cineftp.mobile;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.DefaultRenderersFactory;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.mediacodec.MediaCodecInfo;
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector;
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.extractor.DefaultExtractorsFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/**
 * Full-screen native player (ExoPlayer) with MX Player style controls:
 *  - swipe up/down on the left side = brightness, right side = volume
 *  - swipe left/right = seek, double tap left/right = -10s / +10s, double tap middle = play/pause
 *  - long press = 2x speed while held, pinch = zoom / fit
 *  - gear button = speed, audio track, subtitles; top-right button = aspect ratio
 */
public class PlayerActivity extends AppCompatActivity {

    private ExoPlayer player;
    private PlayerView playerView;
    private TextView titleView;
    private TextView hudView;
    private LinearLayout topBar;
    private AudioManager audio;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Runnable hideHud = () -> hudView.setVisibility(View.GONE);

    private String errorMessage = null;
    private boolean finishedOnce = false;

    // gesture state
    private int gestureMode = 0; // 0 none, 1 brightness, 2 volume, 3 seek
    private float brightnessNow = 0.5f;
    private float volumeNow = 0f;
    private long seekBase = 0L;
    private long seekTarget = 0L;
    private boolean longPressSpeed = false;
    private float savedSpeed = 1f;
    private int resizeIndex = 0;
    private final int[] RESIZE = {
        AspectRatioFrameLayout.RESIZE_MODE_FIT,
        AspectRatioFrameLayout.RESIZE_MODE_ZOOM,
        AspectRatioFrameLayout.RESIZE_MODE_FILL
    };
    private final String[] RESIZE_LABEL = {"Fit", "Zoom", "Stretch"};
    private TextView aspectBtn;
    private TextView decoderBtn;
    private boolean softwareDecoders = false;
    private boolean ffmpegAudio = true;
    private int ladder = 0; // automatic recovery step (decoder combinations tried so far)
    private List<MediaItem> allItems = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(w, false);
        if (Build.VERSION.SDK_INT >= 28) {
            w.getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        hideSystemBars();

        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);

        playerView = new PlayerView(this);
        playerView.setBackgroundColor(Color.BLACK);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        playerView.setControllerShowTimeoutMs(3500);
        playerView.setShowSubtitleButton(true);
        playerView.setShowNextButton(true);
        playerView.setShowPreviousButton(true);
        playerView.setShowRewindButton(true);
        playerView.setShowFastForwardButton(true);
        root.addView(playerView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // top bar: close + title + aspect
        topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        GradientDrawable shade = new GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xCC000000, 0x00000000});
        topBar.setBackground(shade);
        int pad = dp(14);
        topBar.setPadding(pad, dp(10), pad, dp(22));

        TextView close = barButton("✕");
        close.setOnClickListener(v -> finish());
        topBar.addView(close);

        titleView = new TextView(this);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(15f);
        titleView.setSingleLine(true);
        titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        tlp.leftMargin = dp(10);
        tlp.rightMargin = dp(10);
        topBar.addView(titleView, tlp);

        decoderBtn = barButton("HW");
        decoderBtn.setOnClickListener(v -> switchDecoder(!softwareDecoders));
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        dlp.rightMargin = dp(8);
        topBar.addView(decoderBtn, dlp);

        aspectBtn = barButton(RESIZE_LABEL[0]);
        aspectBtn.setOnClickListener(v -> setResize((resizeIndex + 1) % RESIZE.length));
        topBar.addView(aspectBtn);

        root.addView(topBar, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

        // centre HUD (brightness / volume / seek read-outs)
        hudView = new TextView(this);
        hudView.setTextColor(Color.WHITE);
        hudView.setTextSize(20f);
        hudView.setGravity(Gravity.CENTER);
        hudView.setPadding(dp(22), dp(12), dp(22), dp(12));
        GradientDrawable hudBg = new GradientDrawable();
        hudBg.setColor(0xB0000000);
        hudBg.setCornerRadius(dp(14));
        hudView.setBackground(hudBg);
        hudView.setVisibility(View.GONE);
        root.addView(hudView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        playerView.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility ->
            topBar.setVisibility(visibility == View.VISIBLE ? View.VISIBLE : View.GONE));

        try {
            startPlayer();
        } catch (Throwable t) {
            errorMessage = String.valueOf(t.getMessage());
            finish();
            return;
        }
        setupGestures();
    }

    private TextView barButton(String text) {
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextColor(Color.WHITE);
        b.setTextSize(15f);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(12), dp(6), dp(12), dp(6));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x66000000);
        bg.setCornerRadius(dp(18));
        b.setBackground(bg);
        return b;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat c = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    // ------------------------------------------------------------------ player

    private void startPlayer() throws Exception {
        Intent in = getIntent();
        JSONArray items = new JSONArray(in.getStringExtra("items"));
        int startIndex = Math.max(0, Math.min(in.getIntExtra("index", 0), items.length() - 1));
        long startPos = Math.max(0L, in.getLongExtra("position", 0L));

        List<MediaItem> mediaItems = new ArrayList<>();
        for (int i = 0; i < items.length(); i++) {
            JSONObject o = items.getJSONObject(i);
            MediaItem.Builder b = new MediaItem.Builder()
                .setUri(Uri.parse(o.getString("url")))
                .setMediaMetadata(new MediaMetadata.Builder().setTitle(o.optString("title", "")).build());
            JSONArray subs = o.optJSONArray("subtitles");
            if (subs != null && subs.length() > 0) {
                List<MediaItem.SubtitleConfiguration> list = new ArrayList<>();
                for (int s = 0; s < subs.length() && s < 25; s++) {
                    JSONObject so = subs.getJSONObject(s);
                    String su = so.getString("url");
                    String mime = su.toLowerCase(Locale.ROOT).contains(".vtt")
                        ? MimeTypes.TEXT_VTT : MimeTypes.APPLICATION_SUBRIP;
                    list.add(new MediaItem.SubtitleConfiguration.Builder(Uri.parse(su))
                        .setMimeType(mime)
                        .setLabel(so.optString("label", "Subtitle " + (s + 1)))
                        .setLanguage(so.optString("lang", null))
                        .setSelectionFlags(0)
                        .build());
                }
                b.setSubtitleConfigurations(list);
            }
            mediaItems.add(b.build());
        }

        allItems = mediaItems;
        createPlayer(false, startIndex, startPos);
    }

    /** Prefer the phone's own software video decoders (slower, but they work when the hardware decoder crashes). */
    private static MediaCodecSelector softwareFirst() {
        return (mime, secure, tunneling) -> {
            List<MediaCodecInfo> list = new ArrayList<>(MediaCodecUtil.getDecoderInfos(mime, secure, tunneling));
            Collections.sort(list, (x, y) -> Boolean.compare(!x.softwareOnly, !y.softwareOnly));
            return list;
        };
    }

    private void createPlayer(boolean software, int index, long positionMs) {
        softwareDecoders = software;
        if (decoderBtn != null) decoderBtn.setText(software ? "SW" : "HW");

        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(30000)
            .setUserAgent("Mozilla/5.0 (Linux; Android) CineFTP");

        // Software (ffmpeg) audio decoders are used when the phone cannot decode AC3 / EAC3 / DTS itself
        DefaultRenderersFactory renderers = new DefaultRenderersFactory(this)
            .setExtensionRendererMode(ffmpegAudio
                ? DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON
                : DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF)
            .setEnableDecoderFallback(true);
        if (software) renderers.setMediaCodecSelector(softwareFirst());

        DefaultLoadControl load = new DefaultLoadControl.Builder()
            .setBufferDurationsMs(20000, 80000, 1500, 3000)
            .build();

        DefaultExtractorsFactory extractors = new DefaultExtractorsFactory().setConstantBitrateSeekingEnabled(true);

        ExoPlayer np = new ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this, http), extractors))
            .setLoadControl(load)
            .setSeekBackIncrementMs(10000)
            .setSeekForwardIncrementMs(10000)
            .build();
        player = np;
        playerView.setPlayer(np);

        np.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                int code = error.errorCode;
                boolean recoverable = code == PlaybackException.ERROR_CODE_DECODING_FAILED
                    || code == PlaybackException.ERROR_CODE_DECODER_INIT_FAILED
                    || code == PlaybackException.ERROR_CODE_DECODER_QUERY_FAILED
                    || code == PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES
                    || code == PlaybackException.ERROR_CODE_FAILED_RUNTIME_CHECK
                    || code == PlaybackException.ERROR_CODE_UNSPECIFIED
                    || code == PlaybackException.ERROR_CODE_AUDIO_TRACK_INIT_FAILED
                    || code == PlaybackException.ERROR_CODE_AUDIO_TRACK_WRITE_FAILED;
                if (recoverable && ladder < 3) {
                    // try the next decoder combination: HW+ffmpeg -> SW+ffmpeg -> HW only -> SW only
                    ladder++;
                    boolean sw = ladder == 1 || ladder == 3;
                    ffmpegAudio = ladder < 2;
                    showHud("Trying another decoder (" + ladder + "/3)\u2026");
                    ui.post(() -> switchDecoder(sw));
                    return;
                }
                Throwable c = error.getCause();
                StringBuilder where = new StringBuilder();
                if (c != null) {
                    StackTraceElement[] st = c.getStackTrace();
                    for (int i = 0; i < Math.min(3, st.length); i++) {
                        where.append("\n  at ").append(st[i].getClassName()).append('.').append(st[i].getMethodName())
                            .append(':').append(st[i].getLineNumber());
                    }
                }
                errorMessage = error.getErrorCodeName()
                    + (c != null ? " / " + c.getClass().getSimpleName() + ": " + c.getMessage()
                                 : (error.getMessage() != null ? " / " + error.getMessage() : ""))
                    + where;
                // keep the screen and show the real reason, close with the X button
                topBar.setVisibility(View.VISIBLE);
                showHudSticky("Cannot play this file\n" + errorMessage);
                hudView.setTextSize(13f);
            }

            @Override
            public void onMediaItemTransition(MediaItem item, int reason) {
                updateTitle();
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY && player != null && !player.isCurrentMediaItemSeekable()
                        && !warnedUnseekable) {
                    warnedUnseekable = true;
                    showHud("This file has no seek index: jumping may not work");
                }
            }
        });

        np.setMediaItems(allItems, index, positionMs);
        np.prepare();
        np.setPlayWhenReady(true);
        updateTitle();
    }

    private boolean warnedUnseekable = false;

    private void switchDecoder(boolean software) {
        if (player == null) return;
        int idx = player.getCurrentMediaItemIndex();
        long pos = Math.max(0L, player.getCurrentPosition());
        player.release();
        errorMessage = null;
        warnedUnseekable = false;
        createPlayer(software, idx, pos);
        showHud(software ? "Software decoder" : "Hardware decoder");
    }

    private void updateTitle() {
        if (player == null) return;
        MediaItem cur = player.getCurrentMediaItem();
        CharSequence t = cur != null && cur.mediaMetadata.title != null ? cur.mediaMetadata.title : "";
        titleView.setText(t);
    }

    // ---------------------------------------------------------------- gestures

    private void setupGestures() {
        final GestureDetector detector = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDown(MotionEvent e) {
                gestureMode = 0;
                return true;
            }

            @Override
            public boolean onSingleTapConfirmed(MotionEvent e) {
                if (playerView.isControllerFullyVisible()) playerView.hideController();
                else playerView.showController();
                return true;
            }

            @Override
            public boolean onDoubleTap(MotionEvent e) {
                float x = e.getX() / Math.max(1, playerView.getWidth());
                if (x < 0.35f) skip(-10000, "⏪ 10s");
                else if (x > 0.65f) skip(10000, "10s ⏩");
                else if (player != null) {
                    if (player.isPlaying()) player.pause(); else player.play();
                }
                return true;
            }

            @Override
            public void onLongPress(MotionEvent e) {
                if (player == null || gestureMode != 0) return;
                longPressSpeed = true;
                savedSpeed = player.getPlaybackParameters().speed;
                player.setPlaybackSpeed(2f);
                showHudSticky("2x ⏩");
            }

            @Override
            public boolean onScroll(MotionEvent e1, MotionEvent e2, float dx, float dy) {
                if (e1 == null || player == null) return false;
                int w = Math.max(1, playerView.getWidth());
                int h = Math.max(1, playerView.getHeight());
                if (gestureMode == 0) {
                    float totalX = Math.abs(e2.getX() - e1.getX());
                    float totalY = Math.abs(e2.getY() - e1.getY());
                    if (Math.max(totalX, totalY) < dp(12)) return true;
                    if (totalX > totalY) {
                        gestureMode = 3;
                        seekBase = player.getCurrentPosition();
                        seekTarget = seekBase;
                    } else if (e1.getX() < w / 2f) {
                        gestureMode = 1;
                        brightnessNow = currentBrightness();
                    } else {
                        gestureMode = 2;
                        volumeNow = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
                    }
                    playerView.hideController();
                }
                if (gestureMode == 1) {
                    brightnessNow = clamp(brightnessNow + dy / (h * 0.8f), 0.02f, 1f);
                    WindowManager.LayoutParams lp = getWindow().getAttributes();
                    lp.screenBrightness = brightnessNow;
                    getWindow().setAttributes(lp);
                    showHud("☀  " + Math.round(brightnessNow * 100) + "%");
                } else if (gestureMode == 2) {
                    int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    volumeNow = clamp(volumeNow + dy / (h * 0.8f) * max, 0f, max);
                    audio.setStreamVolume(AudioManager.STREAM_MUSIC, Math.round(volumeNow), 0);
                    showHud("🔊  " + Math.round(volumeNow * 100f / max) + "%");
                } else if (gestureMode == 3) {
                    long dur = player.getDuration();
                    long delta = (long) ((e2.getX() - e1.getX()) / w * 180000f);
                    seekTarget = Math.max(0L, seekBase + delta);
                    if (dur > 0) seekTarget = Math.min(seekTarget, dur);
                    long diff = seekTarget - seekBase;
                    showHudSticky((diff >= 0 ? "+" : "-") + fmt(Math.abs(diff)) + "\n" + fmt(seekTarget)
                        + (dur > 0 ? " / " + fmt(dur) : ""));
                }
                return true;
            }
        });
        detector.setIsLongpressEnabled(true);

        final ScaleGestureDetector scale = new ScaleGestureDetector(this,
            new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                @Override
                public boolean onScale(ScaleGestureDetector d) {
                    if (d.getScaleFactor() > 1.08f && resizeIndex != 1) setResize(1);
                    else if (d.getScaleFactor() < 0.92f && resizeIndex != 0) setResize(0);
                    return true;
                }
            });

        playerView.setOnTouchListener((v, e) -> {
            scale.onTouchEvent(e);
            if (scale.isInProgress()) {
                gestureMode = -1;
                return true;
            }
            detector.onTouchEvent(e);
            int a = e.getActionMasked();
            if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL) {
                if (gestureMode == 3 && player != null) player.seekTo(seekTarget);
                if (longPressSpeed && player != null) {
                    player.setPlaybackSpeed(savedSpeed);
                    longPressSpeed = false;
                }
                gestureMode = 0;
                ui.removeCallbacks(hideHud);
                ui.postDelayed(hideHud, 600);
            }
            return true;
        });
    }

    private void skip(long deltaMs, String label) {
        if (player == null) return;
        long dur = player.getDuration();
        long target = Math.max(0L, player.getCurrentPosition() + deltaMs);
        if (dur > 0) target = Math.min(target, dur);
        player.seekTo(target);
        showHud(label);
    }

    private void setResize(int idx) {
        resizeIndex = idx;
        playerView.setResizeMode(RESIZE[idx]);
        aspectBtn.setText(RESIZE_LABEL[idx]);
        showHud(RESIZE_LABEL[idx]);
    }

    private float currentBrightness() {
        float b = getWindow().getAttributes().screenBrightness;
        if (b >= 0f) return b;
        try {
            return Settings.System.getInt(getContentResolver(), Settings.System.SCREEN_BRIGHTNESS) / 255f;
        } catch (Exception e) {
            return 0.5f;
        }
    }

    private static float clamp(float v, float lo, float hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private void showHud(String text) {
        hudView.setText(text);
        hudView.setVisibility(View.VISIBLE);
        ui.removeCallbacks(hideHud);
        ui.postDelayed(hideHud, 900);
    }

    private void showHudSticky(String text) {
        hudView.setText(text);
        hudView.setVisibility(View.VISIBLE);
        ui.removeCallbacks(hideHud);
    }

    private static String fmt(long ms) {
        long s = ms / 1000;
        long h = s / 3600;
        long m = (s % 3600) / 60;
        long sec = s % 60;
        return h > 0 ? String.format(Locale.US, "%d:%02d:%02d", h, m, sec)
                     : String.format(Locale.US, "%02d:%02d", m, sec);
    }

    // --------------------------------------------------------------- lifecycle

    @Override
    public void finish() {
        if (!finishedOnce) {
            finishedOnce = true;
            Intent r = new Intent();
            if (player != null) {
                r.putExtra("index", player.getCurrentMediaItemIndex());
                r.putExtra("position", Math.max(0L, player.getCurrentPosition()));
                r.putExtra("duration", Math.max(0L, player.getDuration()));
            }
            if (errorMessage != null) r.putExtra("error", errorMessage);
            setResult(RESULT_OK, r);
        }
        super.finish();
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (player != null) player.pause();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
