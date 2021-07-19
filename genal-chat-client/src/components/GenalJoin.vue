<template>
  <div class="login">
    <a-modal header="" footer="" :visible="showModal" :closable="false">
      <a-tabs @change="changeType">
        <a-tab-pane key="login" tab="Đăng nhập"> </a-tab-pane>
        <a-tab-pane key="register" tab="Đăng ký" force-render> </a-tab-pane>
      </a-tabs>
      <a-form id="components-form-demo-normal-login" :form="form" class="login-form" @submit="handleSubmit">
        <a-form-item>
          <a-input v-decorator="['username', { rules: [{ required: true, message: 'Vui lòng nhập tên người dùng!' }] }]" placeholder="username">
            <a-icon slot="prefix" type="user" style="color: rgba(0,0,0,.25)" />
          </a-input>
        </a-form-item>
        <a-form-item>
          <a-input
            v-decorator="['password', { rules: [{ required: true, message: 'Xin vui lòng nhập mật khẩu!' }] }]"
            type="password"
            placeholder="Password"
          >
            <a-icon slot="prefix" type="lock" style="color: rgba(0,0,0,.25)" />
          </a-input>
        </a-form-item>
        <a-form-item>
          <a-checkbox
            v-decorator="[
              'remember',
              {
                valuePropName: 'checked',
                initialValue: false,
              },
            ]"
          >
            Nhớ mật khẩu
          </a-checkbox>
          <a-button type="primary" html-type="submit" class="login-form-button">
            {{ buttonText }}
          </a-button>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { nameVerify } from '@/utils/common';

@Component
export default class GenalJoin extends Vue {
  @Prop() showModal: boolean;
  form: any = null;
  type: string = 'login';
  buttonText: string = 'Đăng nhập';

  created() {
    this.form = this.$form.createForm(this, { name: 'normal_login' });
  }

  changeType(type: string) {
    this.type = type;
    if (this.type === 'login') {
      this.buttonText = 'Đăng nhập';
    } else if (this.type === 'register') {
      this.buttonText = 'Đăng ký';
    }
  }

  handleSubmit(e: any) {
    e.preventDefault();
    this.form.validateFields((err: any, user: User) => {
      if (!err) {
        if (this.type === 'register') {
          user.createTime = new Date().valueOf();
        }
        // @ts-ignore
        delete user.remember;
        if (!nameVerify(user.username)) {
          return;
        }
        this.$emit(this.type, user);
      }
    });
  }
}
</script>
<style lang="scss" scoped>
#components-form-demo-normal-login .login-form {
  max-width: 300px;
}
#components-form-demo-normal-login .login-form-forgot {
  float: right;
}
#components-form-demo-normal-login .login-form-button {
  width: 100%;
}
</style>
