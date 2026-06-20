package com.emad.scienceportal;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
            "portal_alerts",
            "تنبيهات البوابة",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("رسائل وملاحظات وشكاوى — مثل واتساب");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{400, 100, 400, 100, 400});
        channel.setLockscreenVisibility(NotificationChannel.VISIBILITY_PUBLIC);

        Uri sound = android.provider.Settings.System.DEFAULT_NOTIFICATION_URI;
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(sound, attrs);

        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(channel);
    }
}
