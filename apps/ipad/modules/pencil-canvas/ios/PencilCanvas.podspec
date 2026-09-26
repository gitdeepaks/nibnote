Pod::Spec.new do |s|
  s.name           = 'PencilCanvas'
  s.version        = '1.0.0'
  s.summary        = 'PencilKit canvas for Nibnote'
  s.description    = 'PKCanvasView-based page canvas: fixed page sizes, templates, atomic saves and Pencil interactions.'
  s.author         = 'Nibnote'
  s.homepage       = 'https://github.com/gitdeepaks/nibnote'
  s.platforms      = { :ios => '26.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '6.0'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PencilKit', 'CryptoKit'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  # Expo glue lives next to this file; pure logic lives in the Core Swift package (tested with xcodebuild).
  s.source_files = '*.swift', 'Core/Sources/**/*.swift'
end
