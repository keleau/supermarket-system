/**
 * 路由汇总  —— 统一挂载到 /api
 */
const express = require('express');

const userRouter = require('./userRouter');
const categoryRouter = require('./categoryRouter');
const productRouter = require('./productRouter');
const supplierRouter = require('./supplierRouter');
const stockRouter = require('./stockRouter');
const stocktakeRouter = require('./stocktakeRouter');
const saleRouter = require('./saleRouter');
const dashboardRouter = require('./dashboardRouter');
const operationLogRouter = require('./operationLogRouter');

const router = express.Router();

router.use('/user', userRouter);
router.use('/category', categoryRouter);
router.use('/product', productRouter);
router.use('/supplier', supplierRouter);
router.use('/stock', stockRouter);
router.use('/stocktake', stocktakeRouter);
router.use('/sale', saleRouter);
router.use('/dashboard', dashboardRouter);
router.use('/operation-log', operationLogRouter);

module.exports = router;
